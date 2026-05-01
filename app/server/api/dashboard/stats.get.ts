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
  // 1. Total messages + pass count in a single groupBy
  const dispositionGroups = await prisma.aggregateRecord.groupBy({
    by: ['disposition'],
    where: {
      report: {
        dateBegin: { gte: new Date(fromMs), lt: new Date(toMs) },
      },
    },
    _sum: { count: true },
  })

  const totalMessages = dispositionGroups.reduce(
    (acc, g) => acc + (g._sum.count ?? 0),
    0,
  )
  const noneMessages = dispositionGroups.find(g => g.disposition === 'none')?._sum.count ?? 0
  const passRate = totalMessages > 0 ? (noneMessages / totalMessages) * 100 : 0

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

  // 4. Top country via GeoLocation join — use $queryRaw for the join aggregation
  // Prisma stores DateTime as ISO text in SQLite — compare with ISO strings, not unix ms.
  const fromIso = new Date(fromMs).toISOString()
  const toIso = new Date(toMs).toISOString()
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
