import prisma from '~~/lib/prisma'

interface TileData {
  totalMessages: number
  passRate: number          // 0–100, percentage
  topSourceIp: string | null
  topCountry: string | null
  distinctIps: number
}

interface StatsResponse {
  current: TileData
  previous: TileData
  window: { from: number; to: number }
}

async function computeTiles(fromMs: number, toMs: number): Promise<TileData> {
  // Prisma stores DateTime as ISO text in SQLite — compare with ISO strings, not unix ms.
  const fromIso = new Date(fromMs).toISOString()
  const toIso = new Date(toMs).toISOString()

  // 1. True DMARC compliance rate: a record passes DMARC if either SPF or DKIM alignment passed.
  //    Prisma groupBy cannot express OR conditions across columns, so we use $queryRaw.
  const complianceRows = await prisma.$queryRaw<Array<{ passing: number; total: number }>>`
    SELECT
      SUM(CASE WHEN ar.dkim = 'pass' OR ar.spf = 'pass' THEN ar.count ELSE 0 END) as passing,
      SUM(ar.count) as total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
  `
  const totalMessages = Number(complianceRows[0]?.total ?? 0)
  const passingMessages = Number(complianceRows[0]?.passing ?? 0)
  const passRate = totalMessages > 0 ? (passingMessages / totalMessages) * 100 : 0

  // 2. Top source IP by sum of count
  const ipGroups = await prisma.aggregateRecord.groupBy({
    by: ['sourceIp'],
    where: {
      report: {
        dateBegin: { gte: new Date(fromMs), lt: new Date(toMs) },
      },
    },
    _sum: { count: true },
    orderBy: { _sum: { count: 'desc' } },
    take: 1,
  })
  const topSourceIp = ipGroups[0]?.sourceIp ?? null

  // 3. Distinct IP count
  const distinctIps = await prisma.aggregateRecord.groupBy({
    by: ['sourceIp'],
    where: {
      report: {
        dateBegin: { gte: new Date(fromMs), lt: new Date(toMs) },
      },
    },
  })

  // 4. Top country via GeoLocation join
  const countryRows = await prisma.$queryRaw<Array<{ country: string | null; total: number }>>`
    SELECT gl.country, SUM(ar.count) as total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    LEFT JOIN GeoLocation gl ON gl.id = ar.geoLocationId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
    GROUP BY gl.country
    ORDER BY total DESC
    LIMIT 1
  `
  const topCountry = countryRows[0]?.country ?? null

  return {
    totalMessages,
    passRate: Math.round(passRate * 10) / 10,
    topSourceIp,
    topCountry,
    distinctIps: distinctIps.length,
  }
}

export default defineEventHandler(async (event): Promise<StatsResponse> => {
  const query = getQuery(event)

  const nowSeconds = Math.floor(Date.now() / 1000)
  const toSeconds = query.to ? Number(query.to) : nowSeconds
  const fromSeconds = query.from ? Number(query.from) : toSeconds - 7 * 24 * 3600

  if (
    !Number.isFinite(fromSeconds) ||
    !Number.isFinite(toSeconds) ||
    fromSeconds >= toSeconds
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })
  }

  const windowMs = (toSeconds - fromSeconds) * 1000
  const toMs = toSeconds * 1000
  const fromMs = fromSeconds * 1000
  const prevToMs = fromMs
  const prevFromMs = fromMs - windowMs

  const [current, previous] = await Promise.all([
    computeTiles(fromMs, toMs),
    computeTiles(prevFromMs, prevToMs),
  ])

  return { current, previous, window: { from: fromSeconds, to: toSeconds } }
})
