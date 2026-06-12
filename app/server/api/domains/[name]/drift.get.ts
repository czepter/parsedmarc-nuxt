import prisma from '~~/lib/prisma'
import { detectDrift, type DriftReport } from '../../../utils/drift'
import { getEmailAuth } from '../../../utils/dns-lookup'

const WINDOW_DAYS = 30

/**
 * GET /api/domains/:name/drift
 * Computes a drift report for one domain by comparing:
 *   - DNS-published DMARC (from cache; falls back to inherited org-domain
 *     policy via PSL-aware ancestor walk when the domain itself has none).
 *   - Latest report's policyP.
 *   - Disposition counts over the last 30 days.
 *
 * Supports two modes:
 *   - domain: name is in the Domain table — use domainId-keyed aggregates.
 *   - headerFromOnly: name is a subdomain that appears only as
 *     AggregateRecord.headerFrom — use headerFrom-keyed aggregates and treat
 *     latestReportPolicy as null (subdomain doesn't own a DMARC policy).
 *
 * Uses the same cache-first DNS path as the email-auth card so stale cache
 * entries are refreshed consistently before classification.
 */
export default defineEventHandler(async (event): Promise<DriftReport> => {
  const { name } = getRouterParams(event)
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Missing domain' })
  }
  const domainName = decodeURIComponent(name).toLowerCase().trim()

  if (!domainName || !/^[a-z0-9.-]+$/.test(domainName)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid domain' })
  }

  const domain = await prisma.domain.findUnique({
    where: { name: domainName },
    select: { id: true },
  })

  // If not in Domain, allow the headerFrom-only path. 404 only when neither
  // path has data.
  let mode: 'domain' | 'headerFromOnly'
  if (domain) {
    mode = 'domain'
  }
  else {
    const hasHeaderFromRecord = await prisma.aggregateRecord.findFirst({
      where: { headerFrom: domainName },
      select: { id: true },
    })
    if (!hasHeaderFromRecord) {
      throw createError({ statusCode: 404, statusMessage: 'Domain not found' })
    }
    mode = 'headerFromOnly'
  }

  const fromIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

  const [emailAuth, latestReport, dispositionRows] = await Promise.all([
    getEmailAuth(domainName),
    mode === 'domain'
      ? prisma.aggregateReport.findFirst({
          where: { domainId: domain!.id },
          orderBy: { dateBegin: 'desc' },
          select: { policyP: true },
        })
      : Promise.resolve(null),
    mode === 'domain'
      ? prisma.$queryRaw<Array<{ disposition: string; total: number }>>`
          SELECT
            ar.disposition AS disposition,
            CAST(SUM(ar.count) AS INTEGER) AS total
          FROM AggregateRecord ar
          JOIN AggregateReport rep ON rep.id = ar.reportId
          WHERE rep.domainId = ${domain!.id}
            AND rep.dateBegin >= ${fromIso}
          GROUP BY ar.disposition
        `
      : prisma.$queryRaw<Array<{ disposition: string; total: number }>>`
          SELECT
            ar.disposition AS disposition,
            CAST(SUM(ar.count) AS INTEGER) AS total
          FROM AggregateRecord ar
          JOIN AggregateReport rep ON rep.id = ar.reportId
          WHERE ar.headerFrom = ${domainName}
            AND rep.dateBegin >= ${fromIso}
          GROUP BY ar.disposition
        `,
  ])

  const dispositionCounts: Record<string, number> = {}
  for (const row of dispositionRows) {
    dispositionCounts[row.disposition] = Number(row.total)
  }

  const dnsLookup = emailAuth.dmarc
    ? {
        record: emailAuth.dmarc.record,
        policy: emailAuth.dmarc.policy,
        error: emailAuth.dmarc.error,
      }
    : null

  return detectDrift({
    dnsLookup,
    latestReportPolicy: latestReport?.policyP ?? null,
    dispositionCounts,
    windowDays: WINDOW_DAYS,
    inheritedPolicy: emailAuth.inheritedDmarc?.lookup.policy ?? null,
  })
})
