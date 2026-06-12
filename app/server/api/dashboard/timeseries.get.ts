import prisma from '~~/lib/prisma'

type Granularity = 'hour' | 'day' | 'week' | 'month'

interface BucketRow {
  bucket: string       // ISO-like string from strftime
  disposition: string
  total: number
}

interface TimeseriesResponse {
  granularity: Granularity
  timestamps: number[]
  none: number[]
  quarantine: number[]
  reject: number[]
}

function pickGranularity(windowSeconds: number): Granularity {
  const day = 24 * 3600
  if (windowSeconds <= 2 * day) return 'hour'
  if (windowSeconds <= 31 * day) return 'day'   // 7d, 30d → daily bars
  if (windowSeconds <= 200 * day) return 'week' // 90d, 6mo → weekly bars
  return 'month'                                // 12mo+   → monthly bars
}

function strftimeFmt(granularity: Granularity): string {
  switch (granularity) {
    case 'hour':  return '%Y-%m-%dT%H:00:00'
    case 'day':   return '%Y-%m-%dT00:00:00'
    case 'week':  return '%Y-%W'
    case 'month': return '%Y-%m'
  }
}

export default defineEventHandler(async (event): Promise<TimeseriesResponse> => {
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

  const windowSeconds = toSeconds - fromSeconds
  const granularity: Granularity =
    (query.granularity as Granularity | undefined) ?? pickGranularity(windowSeconds)

  if (!['hour', 'day', 'week', 'month'].includes(granularity)) {
    throw createError({ statusCode: 400, statusMessage: 'granularity must be hour, day, week, or month' })
  }

  const fmt = strftimeFmt(granularity)
  const fromMs = fromSeconds * 1000
  const toMs = toSeconds * 1000

  // Prisma stores DateTime as ISO text in SQLite — compare with ISO strings, not unix ms.
  // strftime() accepts ISO text directly (no /1000 conversion needed).
  const fromIso = new Date(fromMs).toISOString()
  const toIso = new Date(toMs).toISOString()

  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT
      strftime(${fmt}, rep.dateBegin) AS bucket,
      ar.disposition,
      CAST(SUM(ar.count) AS INTEGER) AS total
    FROM AggregateRecord ar
    JOIN AggregateReport rep ON rep.id = ar.reportId
    WHERE rep.dateBegin >= ${fromIso} AND rep.dateBegin < ${toIso}
    GROUP BY bucket, ar.disposition
    ORDER BY bucket ASC
  `

  function bucketToUnix(b: string): number {
    const parts = b.split('-').map(Number)
    if (granularity === 'week') {
      const year = parts[0] ?? 0
      const week = parts[1] ?? 1
      const jan4 = new Date(Date.UTC(year, 0, 4))
      const weekStart = new Date(jan4)
      weekStart.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7)
      return Math.floor(weekStart.getTime() / 1000)
    }
    if (granularity === 'month') {
      // bucket is 'YYYY-MM' — first day of that month at UTC midnight
      const year = parts[0] ?? 0
      const month = parts[1] ?? 1
      return Math.floor(Date.UTC(year, month - 1, 1) / 1000)
    }
    return Math.floor(new Date(b + 'Z').getTime() / 1000)
  }

  // Generate every bucket in the window — not just buckets that have data —
  // so the chart always shows the full range with zero-height bars for empty days.
  function generateAllBuckets(): string[] {
    const buckets: string[] = []
    if (granularity === 'hour') {
      let cur = new Date(fromMs)
      cur.setUTCMinutes(0, 0, 0)
      const end = new Date(toMs)
      while (cur <= end) {
        buckets.push(cur.toISOString().slice(0, 13) + ':00:00')
        cur = new Date(cur.getTime() + 3600 * 1000)
      }
    }
    else if (granularity === 'day') {
      let cur = new Date(fromMs)
      cur.setUTCHours(0, 0, 0, 0)
      const end = new Date(toMs)
      while (cur <= end) {
        buckets.push(cur.toISOString().slice(0, 10) + 'T00:00:00')
        cur = new Date(cur.getTime() + 86400 * 1000)
      }
    }
    else if (granularity === 'week') {
      // week: start from the Monday on or before fromSeconds
      let cur = new Date(fromMs)
      const dow = cur.getUTCDay() // 0=Sun
      const daysToMon = dow === 0 ? 6 : dow - 1
      cur.setUTCDate(cur.getUTCDate() - daysToMon)
      cur.setUTCHours(0, 0, 0, 0)
      const end = new Date(toMs)
      while (cur <= end) {
        const year = cur.getUTCFullYear()
        const jan4 = new Date(Date.UTC(year, 0, 4))
        const weekNum = Math.ceil(((cur.getTime() - jan4.getTime()) / 86400000 + ((jan4.getUTCDay() + 6) % 7) + 1) / 7)
        buckets.push(`${year}-${String(weekNum).padStart(2, '0')}`)
        cur = new Date(cur.getTime() + 7 * 86400 * 1000)
      }
    }
    else {
      // month: start from the first day of the month containing fromMs (UTC)
      const start = new Date(fromMs)
      let year = start.getUTCFullYear()
      let month = start.getUTCMonth() // 0-indexed
      const end = new Date(toMs)
      while (Date.UTC(year, month, 1) <= end.getTime()) {
        buckets.push(`${year}-${String(month + 1).padStart(2, '0')}`)
        month++
        if (month > 11) { month = 0; year++ }
      }
    }
    return buckets
  }

  const allBuckets = generateAllBuckets()

  const lookup = new Map<string, number>()
  for (const r of rows) {
    lookup.set(`${r.bucket}|${r.disposition}`, Number(r.total))
  }

  const timestamps: number[] = []
  const none: number[] = []
  const quarantine: number[] = []
  const reject: number[] = []

  for (const b of allBuckets) {
    timestamps.push(bucketToUnix(b))
    none.push(lookup.get(`${b}|none`) ?? 0)
    quarantine.push(lookup.get(`${b}|quarantine`) ?? 0)
    reject.push(lookup.get(`${b}|reject`) ?? 0)
  }

  return { granularity, timestamps, none, quarantine, reject }
})
