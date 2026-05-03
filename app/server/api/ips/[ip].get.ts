import prisma from '~~/lib/prisma'

interface DispositionBreakdown {
  disposition: string
  count: number
  pct: number
}

interface DomainSummary {
  name: string
  messageCount: number
}

interface RecentRecord {
  id: string
  reportId: string
  domainName: string
  dateBegin: string
  count: number
  disposition: string
  dkim: string
  spf: string
  headerFrom: string
  dkimAuthResult: string | null
  spfAuthResult: string | null
  dmarcCompliant: boolean
}

interface GeoData {
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

interface IpDetailResponse {
  ip: string
  geo: GeoData | null
  totalMessages: number
  dispositions: DispositionBreakdown[]
  domains: DomainSummary[]
  recentRecords: RecentRecord[]
}

export default defineEventHandler(async (event): Promise<IpDetailResponse> => {
  const { ip: rawIp } = getRouterParams(event)
  const ip = decodeURIComponent(rawIp)

  // Validate: basic length check
  if (!ip || ip.length > 45) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid IP address' })
  }

  // GeoLocation row (may not exist if GeoIP has not enriched this IP yet)
  const geo = await prisma.geoLocation.findUnique({
    where: { ip },
    select: { country: true, city: true, latitude: true, longitude: true },
  })

  // Disposition groups for this IP
  const dispositionGroups = await prisma.aggregateRecord.groupBy({
    by: ['disposition'],
    where: { sourceIp: ip },
    _sum: { count: true },
  })

  if (dispositionGroups.length === 0 && !geo) {
    throw createError({ statusCode: 404, statusMessage: 'IP not found' })
  }

  const totalMessages = dispositionGroups.reduce((acc, g) => acc + (g._sum.count ?? 0), 0)

  const dispositions: DispositionBreakdown[] = dispositionGroups.map(g => ({
    disposition: g.disposition,
    count: g._sum.count ?? 0,
    pct: totalMessages > 0
      ? Math.round(((g._sum.count ?? 0) / totalMessages) * 1000) / 10
      : 0,
  }))

  // Domains seen from this IP — join through report → domain
  const domainRows = await prisma.$queryRaw<Array<{ name: string; total: number }>>`
    SELECT d.name, CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    JOIN Domain d ON d.id = rep.domainId
    WHERE ar.sourceIp = ${ip}
    GROUP BY d.name
    ORDER BY total DESC
    LIMIT 20
  `

  const domains: DomainSummary[] = domainRows.map(r => ({
    name: r.name,
    messageCount: Number(r.total),
  }))

  // Recent records — last 20, newest first
  const records = await prisma.aggregateRecord.findMany({
    where: { sourceIp: ip },
    orderBy: { report: { dateBegin: 'desc' } },
    take: 20,
    select: {
      id: true,
      count: true,
      disposition: true,
      dkim: true,
      spf: true,
      headerFrom: true,
      dkimAuthResult: true,
      spfAuthResult: true,
      report: {
        select: {
          id: true,
          dateBegin: true,
          domain: { select: { name: true } },
        },
      },
    },
  })

  const recentRecords: RecentRecord[] = records.map(r => ({
    id: r.id,
    reportId: r.report.id,
    domainName: r.report.domain.name,
    dateBegin: r.report.dateBegin.toISOString(),
    count: r.count,
    disposition: r.disposition,
    dkim: r.dkim,
    spf: r.spf,
    headerFrom: r.headerFrom,
    dkimAuthResult: r.dkimAuthResult,
    spfAuthResult: r.spfAuthResult,
    dmarcCompliant: r.dkim === 'pass' || r.spf === 'pass',
  }))

  return {
    ip,
    geo: geo
      ? {
          country: geo.country,
          city: geo.city,
          latitude: geo.latitude,
          longitude: geo.longitude,
        }
      : null,
    totalMessages,
    dispositions,
    domains,
    recentRecords,
  }
})
