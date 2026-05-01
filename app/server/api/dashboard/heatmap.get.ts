import prisma from '~~/lib/prisma'

interface HeatmapResponse {
  matrix: number[][]  // matrix[dow][hour], dow: 0=Mon…6=Sun, hour: 0–23
}

export default defineEventHandler(async (event): Promise<HeatmapResponse> => {
  const query = getQuery(event)

  const nowSeconds = Math.floor(Date.now() / 1000)
  const toSeconds = query.to ? Number(query.to) : nowSeconds
  const fromSeconds = query.from ? Number(query.from) : toSeconds - 7 * 24 * 3600

  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || fromSeconds >= toSeconds) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })
  }

  const fromIso = new Date(fromSeconds * 1000).toISOString()
  const toIso = new Date(toSeconds * 1000).toISOString()

  // strftime('%w') returns '0'=Sunday…'6'=Saturday
  // Remap to Mon=0…Sun=6: (dow + 6) % 7
  const rows = await prisma.$queryRaw<
    Array<{ dow: number; hour: number; total: number }>
  >`
    SELECT
      (CAST(strftime('%w', rep.dateBegin) AS INTEGER) + 6) % 7 AS dow,
      CAST(strftime('%H', rep.dateBegin) AS INTEGER) AS hour,
      CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
    GROUP BY dow, hour
  `

  // Initialise a full 7×24 zeros matrix
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))

  for (const row of rows) {
    const dow = Number(row.dow)
    const hour = Number(row.hour)
    const total = Number(row.total)
    if (dow >= 0 && dow <= 6 && hour >= 0 && hour <= 23) {
      matrix[dow][hour] = total
    }
  }

  return { matrix }
})
