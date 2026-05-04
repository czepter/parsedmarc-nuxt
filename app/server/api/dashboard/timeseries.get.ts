import prisma from '~~/lib/prisma'

type Granularity = 'hour' | 'day' | 'week'

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
  if (windowSeconds <= 2 * 24 * 3600) return 'hour'
  if (windowSeconds <= 90 * 24 * 3600) return 'day'
  return 'week'
}

function strftimeFmt(granularity: Granularity): string {
  switch (granularity) {
    case 'hour': return '%Y-%m-%dT%H:00:00'
    case 'day':  return '%Y-%m-%dT00:00:00'
    case 'week': return '%Y-%W'
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

  if (!['hour', 'day', 'week'].includes(granularity)) {
    throw createError({ statusCode: 400, statusMessage: 'granularity must be hour, day, or week' })
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

  const bucketSet = new Set<string>(rows.map(r => r.bucket))
  const sortedBuckets = Array.from(bucketSet).sort()

  function bucketToUnix(b: string): number {
    if (granularity === 'week') {
      const [year, week] = b.split('-').map(Number)
      const jan4 = new Date(Date.UTC(year, 0, 4))
      const weekStart = new Date(jan4)
      weekStart.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7)
      return Math.floor(weekStart.getTime() / 1000)
    }
    return Math.floor(new Date(b + 'Z').getTime() / 1000)
  }

  const lookup = new Map<string, number>()
  for (const r of rows) {
    lookup.set(`${r.bucket}|${r.disposition}`, Number(r.total))
  }

  const timestamps: number[] = []
  const none: number[] = []
  const quarantine: number[] = []
  const reject: number[] = []

  for (const b of sortedBuckets) {
    timestamps.push(bucketToUnix(b))
    none.push(lookup.get(`${b}|none`) ?? 0)
    quarantine.push(lookup.get(`${b}|quarantine`) ?? 0)
    reject.push(lookup.get(`${b}|reject`) ?? 0)
  }

  return { granularity, timestamps, none, quarantine, reject }
})
