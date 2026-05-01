import prisma from '~~/lib/prisma'

interface DomainRow {
  domain: string
  count: number
  share: number
  passRate: number
}

interface HeaderFromResponse {
  domains: DomainRow[]
}

export default defineEventHandler(async (event): Promise<HeaderFromResponse> => {
  const query = getQuery(event)

  const nowSeconds = Math.floor(Date.now() / 1000)
  const toSeconds = query.to ? Number(query.to) : nowSeconds
  const fromSeconds = query.from ? Number(query.from) : toSeconds - 7 * 24 * 3600

  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || fromSeconds >= toSeconds) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })
  }

  const fromIso = new Date(fromSeconds * 1000).toISOString()
  const toIso = new Date(toSeconds * 1000).toISOString()

  const rows = await prisma.$queryRaw<
    Array<{ domain: string; total: number; passCount: number }>
  >`
    SELECT
      ar.headerFrom AS domain,
      CAST(SUM(ar.count) AS INTEGER) AS total,
      CAST(SUM(CASE WHEN ar.disposition = 'none' THEN ar.count ELSE 0 END) AS INTEGER) AS passCount
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
    GROUP BY ar.headerFrom
    ORDER BY total DESC
    LIMIT 10
  `

  const grandTotal = rows.reduce((acc, r) => acc + Number(r.total), 0)

  const domains: DomainRow[] = rows.map(r => {
    const count = Number(r.total)
    const passCount = Number(r.passCount)
    return {
      domain: r.domain,
      count,
      share: grandTotal > 0 ? Math.round((count / grandTotal) * 1000) / 10 : 0,
      passRate: count > 0 ? Math.round((passCount / count) * 1000) / 10 : 0,
    }
  })

  return { domains }
})
