import prisma from '~~/lib/prisma'
import { detectDrift, type DriftReport } from '../../../utils/drift'
import { findInheritedDmarc, isDmarcMissing } from '../../../utils/dns-lookup'

const WINDOW_DAYS = 30

/**
 * GET /api/domains/:name/drift
 * Computes a drift report for one domain by comparing:
 *   - DNS-published DMARC (from cache; falls back to inherited org-domain
 *     policy via PSL-aware ancestor walk when the domain itself has none).
 *   - Latest report's policyP.
 *   - Disposition counts over the last 30 days.
 *
 * Inheritance read is cache-only here (noop refreshFn) so the endpoint stays
 * fast and never triggers live DNS — the daily cron and getEmailAuth handle
 * cache population.
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
  if (!domain) {
    throw createError({ statusCode: 404, statusMessage: 'Domain not found' })
  }

  const [dnsLookup, latestReport, dispositionRows] = await Promise.all([
    prisma.dmarcLookup.findUnique({
      where: { domain: domainName },
      select: { record: true, policy: true, error: true },
    }),
    prisma.aggregateReport.findFirst({
      where: { domainId: domain.id },
      orderBy: { dateBegin: 'desc' },
      select: { policyP: true },
    }),
    prisma.$queryRaw<Array<{ disposition: string; total: number }>>`
      SELECT
        ar.disposition AS disposition,
        CAST(SUM(ar.count) AS INTEGER) AS total
      FROM AggregateRecord ar
      JOIN AggregateReport rep ON rep.id = ar.reportId
      WHERE rep.domainId = ${domain.id}
        AND rep.dateBegin >= ${new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()}
      GROUP BY ar.disposition
    `,
  ])

  const dispositionCounts: Record<string, number> = {}
  for (const row of dispositionRows) {
    dispositionCounts[row.disposition] = Number(row.total)
  }

  // Inheritance: only consult the parent walk when we KNOW the domain has no
  // record of its own (cache says NORECORD/error). Cache-only refreshFn keeps
  // the endpoint DNS-free.
  const cacheOnlyRefresh = async () => {}
  const inherited = isDmarcMissing(dnsLookup)
    ? await findInheritedDmarc(domainName, cacheOnlyRefresh)
    : null

  return detectDrift({
    dnsLookup,
    latestReportPolicy: latestReport?.policyP ?? null,
    dispositionCounts,
    windowDays: WINDOW_DAYS,
    inheritedPolicy: inherited?.policy ?? null,
  })
})
