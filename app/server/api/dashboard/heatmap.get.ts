import prisma from '~~/lib/prisma'

interface HeatmapEntry {
  date: string
  dow: number
  total: number
}

interface HeatmapResponse {
  entries: HeatmapEntry[]
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
    Array<{ date: string; dow: number; total: number }>
  >`
    SELECT
      date(rep.dateBegin) AS date,
      (CAST(strftime('%w', rep.dateBegin) AS INTEGER) + 6) % 7 AS dow,
      CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
    GROUP BY date, dow
    ORDER BY date
  `

  return {
    entries: rows.map(r => ({
      date: String(r.date),
      dow: Number(r.dow),
      total: Number(r.total),
    })),
  }
})
