import prisma from '~~/lib/prisma'

const PAGE_SIZE = 50

type SortField = 'time' | 'count'
type SortOrder = 'asc' | 'desc'

interface RecordRow {
  id: string
  dateBegin: string
  sourceIp: string
  country: string | null
  count: number
  disposition: string
  headerFrom: string
  dkim: string
  spf: string
  spfAuthResult: string | null
  dkimAuthResult: string | null
  dmarcCompliant: boolean
}

interface RecordsResponse {
  records: RecordRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export default defineEventHandler(async (event): Promise<RecordsResponse> => {
  const query = getQuery(event)

  const page = Math.max(1, Number(query.page ?? 1))
  const sort: SortField = query.sort === 'count' ? 'count' : 'time'
  const order: SortOrder = query.order === 'asc' ? 'asc' : 'desc'

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

  const fromMs = fromSeconds * 1000
  const toMs = toSeconds * 1000

  const validDispositions = ['none', 'quarantine', 'reject']
  const dispositionParam = query.disposition
    ? String(query.disposition).split(',').filter(d => validDispositions.includes(d))
    : []
  const dispositionFilter = dispositionParam.length > 0
    ? { disposition: { in: dispositionParam } }
    : {}

  const dkimParam = ['pass', 'fail'].includes(String(query.dkim)) ? String(query.dkim) : null
  const spfParam  = ['pass', 'fail'].includes(String(query.spf))  ? String(query.spf)  : null

  const where = {
    ...dispositionFilter,
    ...(dkimParam ? { dkim: dkimParam } : {}),
    ...(spfParam  ? { spf:  spfParam  } : {}),
    report: {
      dateBegin: { gte: new Date(fromMs), lt: new Date(toMs) },
    },
  }

  const orderBy = sort === 'count'
    ? { count: order }
    : { report: { dateBegin: order } }

  const [records, total] = await Promise.all([
    prisma.aggregateRecord.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        sourceIp: true,
        count: true,
        disposition: true,
        headerFrom: true,
        dkim: true,
        spf: true,
        spfAuthResult: true,
        dkimAuthResult: true,
        report: {
          select: { dateBegin: true },
        },
        geoLocation: {
          select: { country: true },
        },
      },
    }),
    prisma.aggregateRecord.count({ where }),
  ])

  const rows: RecordRow[] = records.map(r => ({
    id: r.id,
    dateBegin: r.report.dateBegin.toISOString(),
    sourceIp: r.sourceIp,
    country: r.geoLocation?.country ?? null,
    count: r.count,
    disposition: r.disposition,
    headerFrom: r.headerFrom,
    dkim: r.dkim,
    spf: r.spf,
    spfAuthResult: r.spfAuthResult,
    dkimAuthResult: r.dkimAuthResult,
    dmarcCompliant: r.dkim === 'pass' || r.spf === 'pass',
  }))

  return {
    records: rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  }
})
