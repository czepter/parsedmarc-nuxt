import prisma from '~~/lib/prisma'
import { detectDrift, type DriftKind } from '../../utils/drift'
import {
  findInheritedDmarc,
  isDmarcMissing,
  type InheritedDmarc,
} from '../../utils/dns-lookup'

interface DomainRow {
  name: string
  reportCount: number
  messageCount: number
  forensicCount: number
  dmarc: {
    policy: string | null
    pct: number | null
    hasRecord: boolean
    error: string | null
    lookedUpAt: string | null
  } | null
  spf: {
    hasRecord: boolean
    qualifierAll: string | null
    error: string | null
    lookedUpAt: string | null
  } | null
  dkimSelectorCount: number
  mx: {
    count: number
    error: string | null
    lookedUpAt: string | null
  } | null
  drift: DriftKind
  /**
   * If this domain has no DMARC record of its own but an organisational
   * ancestor does, the inherited policy is surfaced here. `null` for domains
   * with their own valid DMARC record or with no ancestor record found.
   */
  inheritedDmarc: InheritedDmarc | null
}

interface DomainsListResponse {
  domains: DomainRow[]
}

const DRIFT_WINDOW_DAYS = 30

/**
 * GET /api/domains
 * Lists every reported-for domain with stats + cached email-auth + drift.
 * No fresh DNS calls — pure cached read for fast list rendering.
 */
export default defineEventHandler(async (): Promise<DomainsListResponse> => {
  // 1. All domains with report/forensic counts.
  const domains = await prisma.domain.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { aggregateReports: true, forensicReports: true } },
    },
  })

  if (domains.length === 0) return { domains: [] }

  const names = domains.map(d => d.name)

  // 2a. Message totals per policy domain — group by the reporter's domainId.
  //     This covers domains that own DMARC reports.
  const messageRows = await prisma.$queryRaw<
    Array<{ domainId: string; total: number }>
  >`
    SELECT rep.domainId AS domainId,
      CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    GROUP BY rep.domainId
  `
  const messageMap = new Map<string, number>(
    messageRows.map(r => [r.domainId, Number(r.total)]),
  )

  // 2b. Message totals per headerFrom — group by the actual From: header
  //     domain in each record. Used as the message count for headerFrom-only
  //     domains (subdomains that send mail under a parent's DMARC policy and
  //     therefore have no AggregateReport rows of their own).
  const headerFromRows = await prisma.$queryRaw<
    Array<{ headerFrom: string; total: number }>
  >`
    SELECT ar.headerFrom AS headerFrom,
      CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    GROUP BY ar.headerFrom
  `
  const headerFromMessageMap = new Map<string, number>(
    headerFromRows.map(r => [r.headerFrom, Number(r.total)]),
  )

  // 3. Latest report policyP per domain (for drift detection).
  const latestReports = await prisma.aggregateReport.findMany({
    orderBy: { dateBegin: 'desc' },
    distinct: ['domainId'],
    select: { domainId: true, policyP: true },
  })
  const latestPolicyMap = new Map<string, string | null>(
    latestReports.map(r => [r.domainId, r.policyP]),
  )

  // 4. Disposition counts per domain over the last 30 days.
  const fromIso = new Date(Date.now() - DRIFT_WINDOW_DAYS * 86_400_000).toISOString()
  const dispositionRows = await prisma.$queryRaw<
    Array<{ domainId: string; disposition: string; total: number }>
  >`
    SELECT rep.domainId AS domainId, ar.disposition AS disposition,
      CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso}
    GROUP BY rep.domainId, ar.disposition
  `
  const dispositionMap = new Map<string, Record<string, number>>()
  for (const row of dispositionRows) {
    if (!dispositionMap.has(row.domainId)) dispositionMap.set(row.domainId, {})
    dispositionMap.get(row.domainId)![row.disposition] = Number(row.total)
  }

  // 5. Cached lookups (batched by name).
  const [dmarcRows, spfRows, mxRows, dkimRows] = await Promise.all([
    prisma.dmarcLookup.findMany({ where: { domain: { in: names } } }),
    prisma.spfLookup.findMany({ where: { domain: { in: names } } }),
    prisma.mxLookup.findMany({ where: { domain: { in: names } } }),
    prisma.dkimLookup.findMany({
      where: { domain: { in: names }, hasKey: true },
      select: { domain: true, selector: true },
    }),
  ])

  const dmarcMap = new Map(dmarcRows.map(r => [r.domain, r]))
  const spfMap = new Map(spfRows.map(r => [r.domain, r]))
  const mxMap = new Map(mxRows.map(r => [r.domain, r]))
  const dkimCountMap = new Map<string, number>()
  for (const r of dkimRows) {
    dkimCountMap.set(r.domain, (dkimCountMap.get(r.domain) ?? 0) + 1)
  }

  // 6. Compose rows + per-domain drift kind.
  //    findInheritedDmarc is async but cache-only here (noop refreshFn) to
  //    preserve the list endpoint's "no fresh DNS calls" guarantee. Parents
  //    that haven't been looked up yet are picked up by the daily refresh
  //    Croner; until then, the row simply shows no inherited info.
  const cacheOnlyRefresh = async () => {}
  const rows: DomainRow[] = await Promise.all(domains.map(async (d) => {
    const dmarc = dmarcMap.get(d.name) ?? null
    const spf = spfMap.get(d.name) ?? null
    const mx = mxMap.get(d.name) ?? null

    // Resolve inherited DMARC only when we KNOW the domain itself has no
    // record (cached lookup says no record). If no cache row exists at all,
    // we don't yet know whether the domain has its own record — leave
    // inheritance null until a lookup populates the cache.
    const inheritedDmarc = isDmarcMissing(dmarc)
      ? await findInheritedDmarc(d.name, cacheOnlyRefresh)
      : null

    const drift = detectDrift({
      dnsLookup: dmarc
        ? { record: dmarc.record, policy: dmarc.policy, error: dmarc.error }
        : null,
      latestReportPolicy: latestPolicyMap.get(d.id) ?? null,
      dispositionCounts: dispositionMap.get(d.id) ?? {},
      windowDays: DRIFT_WINDOW_DAYS,
      inheritedPolicy: inheritedDmarc?.policy ?? null,
    })

    let mxCount = 0
    if (mx?.records) {
      try {
        mxCount = (JSON.parse(mx.records) as unknown[]).length
      }
      catch {
        mxCount = 0
      }
    }

    // Pick the right message count source: policy domains (with reports of
    // their own) use the report-grouped count; headerFrom-only domains use
    // the headerFrom-grouped count so the list shows non-zero totals.
    const reportCount = d._count.aggregateReports
    const messageCount = reportCount > 0
      ? (messageMap.get(d.id) ?? 0)
      : (headerFromMessageMap.get(d.name) ?? 0)

    return {
      name: d.name,
      reportCount,
      messageCount,
      forensicCount: d._count.forensicReports,
      dmarc: dmarc
        ? {
            policy: dmarc.policy,
            pct: dmarc.pct,
            hasRecord: dmarc.record !== null,
            error: dmarc.error,
            lookedUpAt: dmarc.lookedUpAt.toISOString(),
          }
        : null,
      spf: spf
        ? {
            hasRecord: spf.record !== null,
            qualifierAll: spf.qualifierAll,
            error: spf.error,
            lookedUpAt: spf.lookedUpAt.toISOString(),
          }
        : null,
      dkimSelectorCount: dkimCountMap.get(d.name) ?? 0,
      mx: mx
        ? {
            count: mxCount,
            error: mx.error,
            lookedUpAt: mx.lookedUpAt.toISOString(),
          }
        : null,
      drift: drift.kind,
      inheritedDmarc,
    }
  }))

  // Sort by message count desc.
  rows.sort((a, b) => b.messageCount - a.messageCount)

  return { domains: rows }
})
