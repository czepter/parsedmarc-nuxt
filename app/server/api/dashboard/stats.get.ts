import prisma from '~~/lib/prisma'

interface TileData {
  totalMessages: number
  passRate: number          // 0–100
  misconfiguredRate: number // 0–100
  spoofedRate: number       // 0–100
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

  // Three mutually exclusive status buckets (mirrors auth.get.ts logic):
  //   passing      — dkim='pass' OR spf='pass'
  //   misconfigured — DMARC failed but at least one raw auth check passed
  //   spoofed      — remainder (no auth passed at all)
  const complianceRows = await prisma.$queryRaw<
    Array<{ passing: number; misconfigured: number; total: number }>
  >`
    SELECT
      SUM(CASE WHEN ar.dkim = 'pass' OR ar.spf = 'pass'
               THEN ar.count ELSE 0 END) as passing,
      SUM(CASE
            WHEN (ar.dkim != 'pass' AND ar.spf != 'pass')
              AND (ar.dkimAuthResult = 'pass' OR ar.spfAuthResult = 'pass')
            THEN ar.count ELSE 0 END) as misconfigured,
      SUM(ar.count) as total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
  `

  const totalMessages = Number(complianceRows[0]?.total ?? 0)
  const passingMessages = Number(complianceRows[0]?.passing ?? 0)
  const misconfiguredMessages = Number(complianceRows[0]?.misconfigured ?? 0)
  const spoofedMessages = Math.max(0, totalMessages - passingMessages - misconfiguredMessages)

  function rate(n: number): number {
    return totalMessages > 0 ? Math.round((n / totalMessages) * 1000) / 10 : 0
  }

  // Distinct IP count
  const distinctIpGroups = await prisma.aggregateRecord.groupBy({
    by: ['sourceIp'],
    where: {
      report: {
        dateBegin: { gte: new Date(fromMs), lt: new Date(toMs) },
      },
    },
  })

  return {
    totalMessages,
    passRate: rate(passingMessages),
    misconfiguredRate: rate(misconfiguredMessages),
    spoofedRate: rate(spoofedMessages),
    distinctIps: distinctIpGroups.length,
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
