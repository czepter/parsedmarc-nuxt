import prisma from '~~/lib/prisma'

interface CountryRow {
  code: string | null
  name: string | null
  count: number
  share: number
}

interface CountriesResponse {
  countries: CountryRow[]
}

export default defineEventHandler(async (event): Promise<CountriesResponse> => {
  const query = getQuery(event)

  const nowSeconds = Math.floor(Date.now() / 1000)
  const toSeconds = query.to ? Number(query.to) : nowSeconds
  const fromSeconds = query.from ? Number(query.from) : toSeconds - 7 * 24 * 3600

  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || fromSeconds >= toSeconds) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })
  }

  const fromIso = new Date(fromSeconds * 1000).toISOString()
  const toIso = new Date(toSeconds * 1000).toISOString()

  const rows = await prisma.$queryRaw<Array<{ country: string | null; total: number }>>`
    SELECT gl.country, CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    LEFT JOIN GeoLocation gl ON gl.id = ar.geoLocationId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
    GROUP BY gl.country
    ORDER BY total DESC
    LIMIT 10
  `

  const grandTotal = rows.reduce((acc, r) => acc + Number(r.total), 0)

  const countries: CountryRow[] = rows.map(r => ({
    code: r.country,
    name: r.country,
    count: Number(r.total),
    share: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 1000) / 10 : 0,
  }))

  return { countries }
})
