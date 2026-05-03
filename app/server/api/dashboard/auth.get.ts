import prisma from '~~/lib/prisma'

interface StatusCategory {
  count: number
  pct: number
}

interface AuthResponse {
  pass: StatusCategory
  misconfigured: StatusCategory
  spoofed: StatusCategory
  total: number
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

  // Three mutually exclusive categories (sum = total):
  //   pass         — DMARC alignment passed (dkim='pass' OR spf='pass')
  //   misconfigured — DMARC failed BUT at least one raw auth check passed
  //                  (auth passed, alignment failed — wrong domain, relay, forwarding)
  //   spoofed      — DMARC failed AND no auth check passed (likely forged)
  const rows = await prisma.$queryRaw<
    Array<{ passing: number; misconfigured: number; total: number }>
  >`
    SELECT
      CAST(SUM(CASE WHEN ar.dkim = 'pass' OR ar.spf = 'pass'
                    THEN ar.count ELSE 0 END) AS INTEGER) AS passing,
      CAST(SUM(CASE
                 WHEN (ar.dkim != 'pass' AND ar.spf != 'pass')
                   AND (ar.dkimAuthResult = 'pass' OR ar.spfAuthResult = 'pass')
                 THEN ar.count ELSE 0 END) AS INTEGER) AS misconfigured,
      CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
  `

  const row = rows[0] ?? { passing: 0, misconfigured: 0, total: 0 }
  const passing = Number(row.passing)
  const misconfigured = Number(row.misconfigured)
  const total = Number(row.total)
  const spoofed = Math.max(0, total - passing - misconfigured)

  function pct(n: number): number {
    return total > 0 ? Math.round((n / total) * 1000) / 10 : 0
  }

  return {
    pass: { count: passing, pct: pct(passing) },
    misconfigured: { count: misconfigured, pct: pct(misconfigured) },
    spoofed: { count: spoofed, pct: pct(spoofed) },
    total,
  }
})
