import prisma from '~~/lib/prisma'

interface AuthDimension {
  pass: number
  fail: number
  total: number
}

interface AuthResponse {
  dkim: AuthDimension
  spf: AuthDimension
}

export default defineEventHandler(async (event): Promise<AuthResponse> => {
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
    Array<{
      dkimPass: number
      dkimFail: number
      spfPass: number
      spfFail: number
    }>
  >`
    SELECT
      CAST(SUM(CASE WHEN ar.dkim = 'pass' THEN ar.count ELSE 0 END) AS INTEGER) AS dkimPass,
      CAST(SUM(CASE WHEN ar.dkim != 'pass' THEN ar.count ELSE 0 END) AS INTEGER) AS dkimFail,
      CAST(SUM(CASE WHEN ar.spf  = 'pass' THEN ar.count ELSE 0 END) AS INTEGER) AS spfPass,
      CAST(SUM(CASE WHEN ar.spf  != 'pass' THEN ar.count ELSE 0 END) AS INTEGER) AS spfFail
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
  `

  const row = rows[0] ?? { dkimPass: 0, dkimFail: 0, spfPass: 0, spfFail: 0 }

  const dkimPass = Number(row.dkimPass)
  const dkimFail = Number(row.dkimFail)
  const spfPass = Number(row.spfPass)
  const spfFail = Number(row.spfFail)

  return {
    dkim: { pass: dkimPass, fail: dkimFail, total: dkimPass + dkimFail },
    spf: { pass: spfPass, fail: spfFail, total: spfPass + spfFail },
  }
})
