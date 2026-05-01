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
}

export default defineEventHandler(async (event): Promise<DomainDetailResponse> => {
  const { name } = getRouterParams(event)
  const domainName = decodeURIComponent(name)

  const domain = await prisma.domain.findUnique({
    where: { name: domainName },
    select: { id: true, name: true },
  })

  if (!domain) {
    throw createError({ statusCode: 404, statusMessage: 'Domain not found' })
  }

  // Aggregate record stats grouped by IP + disposition.
  // Cap at 500 rows to bound memory — enough to find the top-10 IPs accurately
  // for all but the most extreme domains (thousands of distinct sending IPs).
  const ipGroups = await prisma.aggregateRecord.groupBy({
    by: ['sourceIp', 'disposition'],
    where: {
      report: { domainId: domain.id },
    },
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

  const forensicCount = await prisma.forensicReport.count({
    where: { domainId: domain.id },
  })

  const reports = await prisma.aggregateReport.findMany({
    where: { domainId: domain.id },
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

  const recentReports: RecentReport[] = reports.map(r => ({
    id: r.id,
    reportId: r.reportId,
    orgName: r.orgName,
    dateBegin: r.dateBegin.toISOString(),
    dateEnd: r.dateEnd.toISOString(),
    recordCount: r._count.records,
  }))

  return {
    name: domain.name,
    totalMessages,
    distinctIps,
    forensicCount,
    topIps,
    recentReports,
  }
})
