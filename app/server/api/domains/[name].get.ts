import type { Prisma } from '../../../generated/prisma/client'
import prisma from '~~/lib/prisma'

interface TopIp {
  sourceIp: string
  country: string | null
  totalCount: number
  passCount: number
  passRate: number
}

interface RecentReport {
  id: string
  reportId: string
  orgName: string
  dateBegin: string
  dateEnd: string
  recordCount: number
}

interface DomainDetailResponse {
  name: string
  totalMessages: number
  distinctIps: number
  forensicCount: number
  topIps: TopIp[]
  recentReports: RecentReport[]
  /**
   * `domain` when this name is in the Domain table (owns DMARC reports of its
   * own); `headerFromOnly` when it appears only as AggregateRecord.headerFrom
   * (a subdomain that sends mail under a parent's policy). The two modes use
   * different filters but produce the same response shape.
   */
  mode: 'domain' | 'headerFromOnly'
}

export default defineEventHandler(async (event): Promise<DomainDetailResponse> => {
  const { name } = getRouterParams(event)
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Missing domain' })
  }
  const domainName = decodeURIComponent(name)

  const domain = await prisma.domain.findUnique({
    where: { name: domainName },
    select: { id: true, name: true },
  })

  // Fallback: if not in Domain table, check whether the name appears as
  // AggregateRecord.headerFrom (subdomain under a parent's DMARC policy).
  // Only 404 when neither path has data.
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

  const recordWhere: Prisma.AggregateRecordWhereInput = mode === 'domain'
    ? { report: { domainId: domain!.id } }
    : { headerFrom: domainName }

  // Aggregate record stats grouped by IP + disposition.
  // Cap at 500 rows to bound memory — enough to find the top-10 IPs accurately
  // for all but the most extreme domains (thousands of distinct sending IPs).
  const ipGroups = await prisma.aggregateRecord.groupBy({
    by: ['sourceIp', 'disposition'],
    where: recordWhere,
    _sum: { count: true },
    orderBy: { _sum: { count: 'desc' } },
    take: 500,
  })

  // Collapse per-IP-per-disposition into per-IP totals
  const ipMap = new Map<string, { total: number; pass: number }>()
  for (const g of ipGroups) {
    const entry = ipMap.get(g.sourceIp) ?? { total: 0, pass: 0 }
    const n = g._sum.count ?? 0
    entry.total += n
    if (g.disposition === 'none') entry.pass += n
    ipMap.set(g.sourceIp, entry)
  }

  // Sort by total desc, take top 10
  const sortedIps = Array.from(ipMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)

  // Enrich with GeoLocation
  const geoRows = await prisma.geoLocation.findMany({
    where: { ip: { in: sortedIps.map(([ip]) => ip) } },
    select: { ip: true, country: true },
  })
  const geoMap = new Map<string, string | null>(geoRows.map(g => [g.ip, g.country]))

  const topIps: TopIp[] = sortedIps.map(([ip, stats]) => ({
    sourceIp: ip,
    country: geoMap.get(ip) ?? null,
    totalCount: stats.total,
    passCount: stats.pass,
    passRate: stats.total > 0 ? Math.round((stats.pass / stats.total) * 1000) / 10 : 0,
  }))

  const totalMessages = Array.from(ipMap.values()).reduce((acc, v) => acc + v.total, 0)
  const distinctIps = ipMap.size

  // Forensic reports only exist for policy domains; subdomains never own them.
  const forensicCount = mode === 'domain'
    ? await prisma.forensicReport.count({ where: { domainId: domain!.id } })
    : 0

  // Recent aggregate reports.
  // - domain mode: reports addressed to this domain's DMARC policy.
  // - headerFromOnly: reports that contain at least one record about this
  //   subdomain. The recordCount is filtered to records matching the
  //   subdomain so the user sees per-subdomain volume per report.
  let recentReports: RecentReport[]
  if (mode === 'domain') {
    const reports = await prisma.aggregateReport.findMany({
      where: { domainId: domain!.id },
      orderBy: { dateBegin: 'desc' },
      take: 20,
      select: {
        id: true,
        reportId: true,
        orgName: true,
        dateBegin: true,
        dateEnd: true,
        _count: { select: { records: true } },
      },
    })
    recentReports = reports.map(r => ({
      id: r.id,
      reportId: r.reportId,
      orgName: r.orgName,
      dateBegin: r.dateBegin.toISOString(),
      dateEnd: r.dateEnd.toISOString(),
      recordCount: r._count.records,
    }))
  }
  else {
    const reports = await prisma.aggregateReport.findMany({
      where: { records: { some: { headerFrom: domainName } } },
      orderBy: { dateBegin: 'desc' },
      take: 20,
      select: {
        id: true,
        reportId: true,
        orgName: true,
        dateBegin: true,
        dateEnd: true,
        _count: { select: { records: { where: { headerFrom: domainName } } } },
      },
    })
    recentReports = reports.map(r => ({
      id: r.id,
      reportId: r.reportId,
      orgName: r.orgName,
      dateBegin: r.dateBegin.toISOString(),
      dateEnd: r.dateEnd.toISOString(),
      recordCount: r._count.records,
    }))
  }

  return {
    name: domain?.name ?? domainName,
    totalMessages,
    distinctIps,
    forensicCount,
    topIps,
    recentReports,
    mode,
  }
})
