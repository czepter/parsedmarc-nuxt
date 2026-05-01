import prisma from '~~/lib/prisma'

interface DomainResult {
  type: 'domain'
  name: string
  href: string
}

interface IpResult {
  type: 'ip'
  ip: string
  country: string | null
  href: string
}

interface ForensicResult {
  type: 'forensic'
  id: string
  subject: string
  sourceIp: string
  arrivalDate: string
  href: string
}

interface SearchResponse {
  domains: DomainResult[]
  ips: IpResult[]
  forensics: ForensicResult[]
  query: string
}

export default defineEventHandler(async (event): Promise<SearchResponse> => {
  const { q } = getQuery(event)

  const query = String(q ?? '').trim()

  if (query.length < 2) {
    return { domains: [], ips: [], forensics: [], query }
  }

  // Sanitize: length cap only — Prisma handles SQL escaping
  const sanitized = query.slice(0, 100)

  const [domainRows, ipRows, forensicRows] = await Promise.all([
    // Domain search: name contains query
    prisma.domain.findMany({
      where: { name: { contains: sanitized } },
      select: { name: true },
      take: 5,
      orderBy: { name: 'asc' },
    }),

    // IP search: ip starts with query
    prisma.geoLocation.findMany({
      where: { ip: { startsWith: sanitized } },
      select: { ip: true, country: true },
      take: 5,
      orderBy: { ip: 'asc' },
    }),

    // Forensic search: subject contains query
    prisma.forensicReport.findMany({
      where: { subject: { contains: sanitized } },
      select: { id: true, subject: true, sourceIp: true, arrivalDate: true },
      take: 5,
      orderBy: { arrivalDate: 'desc' },
    }),
  ])

  const domains: DomainResult[] = domainRows.map(d => ({
    type: 'domain',
    name: d.name,
    href: `/domains/${encodeURIComponent(d.name)}`,
  }))

  const ips: IpResult[] = ipRows.map(g => ({
    type: 'ip',
    ip: g.ip,
    country: g.country,
    href: `/ips/${g.ip}`,
  }))

  const forensics: ForensicResult[] = forensicRows.map(f => ({
    type: 'forensic',
    id: f.id,
    subject: f.subject,
    sourceIp: f.sourceIp,
    arrivalDate: f.arrivalDate.toISOString(),
    href: `/forensics/${f.id}`,
  }))

  return { domains, ips, forensics, query: sanitized }
})
