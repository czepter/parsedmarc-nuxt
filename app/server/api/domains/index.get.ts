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

  const policyDomainNames = new Set(domains.map(d => d.name))

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

  // headerFrom-only domains: subdomains (or any From: domain) seen in records
  // but not represented in the Domain table. These send mail under a parent's
  // policy and never own a DMARC report. We still want to surface them so the
  // analyst can see their inherited policy and per-subdomain disposition.
  const headerFromOnlyNames = headerFromRows
    .map(r => r.headerFrom)
    .filter(name => name && !policyDomainNames.has(name))
  const allLookupNames = [...policyDomainNames, ...headerFromOnlyNames]

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

  // 4b. Disposition counts grouped by headerFrom (last 30 days). Used for
  //     drift detection on headerFrom-only domains, which have no domainId.
  const headerFromDispositionRows = await prisma.$queryRaw<
    Array<{ headerFrom: string; disposition: string; total: number }>
  >`
    SELECT ar.headerFrom AS headerFrom, ar.disposition AS disposition,
      CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso}
    GROUP BY ar.headerFrom, ar.disposition
  `
  const headerFromDispositionMap = new Map<string, Record<string, number>>()
  for (const row of headerFromDispositionRows) {
    if (!headerFromDispositionMap.has(row.headerFrom)) headerFromDispositionMap.set(row.headerFrom, {})
    headerFromDispositionMap.get(row.headerFrom)![row.disposition] = Number(row.total)
  }

  // 5. Cached lookups (batched by name — covers both policy domains and
  //    headerFrom-only domains).
  const [dmarcRows, spfRows, mxRows, dkimRows] = await Promise.all([
    prisma.dmarcLookup.findMany({ where: { domain: { in: allLookupNames } } }),
    prisma.spfLookup.findMany({ where: { domain: { in: allLookupNames } } }),
    prisma.mxLookup.findMany({ where: { domain: { in: allLookupNames } } }),
    prisma.dkimLookup.findMany({
      where: { domain: { in: allLookupNames }, hasKey: true },
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

  // Helper: build a row for one domain. `source` is either a Domain-table row
  // (with its own reports/forensics) or a headerFrom-only row (no Domain
  // record). For headerFrom-only rows, inheritance is consulted unconditionally
  // because we have no cache state to reason about — these are subdomains we
  // never proactively looked up.
  async function buildRow(source: {
    name: string
    domainId: string | null
    reportCount: number
    forensicCount: number
    headerFromOnly: boolean
  }): Promise<DomainRow> {
    const dmarc = dmarcMap.get(source.name) ?? null
    const spf = spfMap.get(source.name) ?? null
    const mx = mxMap.get(source.name) ?? null

    // For Domain-table rows, only walk inheritance when the cache says
    // "no record" (record === null). For headerFrom-only rows, walk
    // unconditionally — surfacing the parent's policy is the whole point.
    const shouldInherit = source.headerFromOnly || isDmarcMissing(dmarc)
    const inheritedDmarc = shouldInherit
      ? await findInheritedDmarc(source.name, cacheOnlyRefresh)
      : null

    const dispositionCounts = source.domainId
      ? (dispositionMap.get(source.domainId) ?? {})
      : (headerFromDispositionMap.get(source.name) ?? {})

    const latestReportPolicy = source.domainId
      ? (latestPolicyMap.get(source.domainId) ?? null)
      : null

    const drift = detectDrift({
      dnsLookup: dmarc
        ? { record: dmarc.record, policy: dmarc.policy, error: dmarc.error }
        : null,
      latestReportPolicy,
      dispositionCounts,
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

    // Message count source: policy domains use report-grouped totals;
    // headerFrom-only domains use the headerFrom-grouped totals.
    const messageCount = source.headerFromOnly
      ? (headerFromMessageMap.get(source.name) ?? 0)
      : (source.reportCount > 0
        ? (messageMap.get(source.domainId!) ?? 0)
        : (headerFromMessageMap.get(source.name) ?? 0))

    return {
      name: source.name,
      reportCount: source.reportCount,
      messageCount,
      forensicCount: source.forensicCount,
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
      dkimSelectorCount: dkimCountMap.get(source.name) ?? 0,
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
  }

  const rows: DomainRow[] = await Promise.all([
    ...domains.map(d => buildRow({
      name: d.name,
      domainId: d.id,
      reportCount: d._count.aggregateReports,
      forensicCount: d._count.forensicReports,
      headerFromOnly: false,
    })),
    ...headerFromOnlyNames.map(name => buildRow({
      name,
      domainId: null,
      reportCount: 0,
      forensicCount: 0,
      headerFromOnly: true,
    })),
  ])

  // Sort by message count desc.
  rows.sort((a, b) => b.messageCount - a.messageCount)

  return { domains: rows }
})
