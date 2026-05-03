import prisma from '~~/lib/prisma'

interface GeoData {
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

interface SiblingRecord {
  id: string
  sourceIp: string
  count: number
  disposition: string
  dkim: string
  spf: string
  headerFrom: string
  country: string | null
  spfAuthResult: string | null
  dkimAuthResult: string | null
}

interface ReportDetail {
  id: string
  orgReportId: string
  orgName: string
  dateBegin: string
  dateEnd: string
  domainName: string
  inboxLabel: string
  rawXml: string
  policyP: string | null
  policySp: string | null
  policyAdkim: string | null
  policyAspf: string | null
  policyPct: number | null
}

interface RecordDetailResponse {
  id: string
  sourceIp: string
  count: number
  disposition: string
  dkim: string
  spf: string
  headerFrom: string
  spfAuthDomain: string | null
  spfAuthResult: string | null
  dkimAuthDomain: string | null
  dkimAuthSelector: string | null
  dkimAuthResult: string | null
  dmarcCompliant: boolean
  geo: GeoData | null
  report: ReportDetail
  siblings: SiblingRecord[]
}

export default defineEventHandler(async (event): Promise<RecordDetailResponse> => {
  const { id } = getRouterParams(event)

  const record = await prisma.aggregateRecord.findUnique({
    where: { id },
    select: {
      id: true,
      sourceIp: true,
      count: true,
      disposition: true,
      dkim: true,
      spf: true,
      headerFrom: true,
      spfAuthDomain: true,
      spfAuthResult: true,
      dkimAuthDomain: true,
      dkimAuthSelector: true,
      dkimAuthResult: true,
      geoLocation: {
        select: { country: true, city: true, latitude: true, longitude: true },
      },
      report: {
        select: {
          id: true,
          reportId: true,
          orgName: true,
          dateBegin: true,
          dateEnd: true,
          rawXml: true,
          policyP: true,
          policySp: true,
          policyAdkim: true,
          policyAspf: true,
          policyPct: true,
          domain: { select: { name: true } },
          inbox: { select: { label: true } },
          records: {
            select: {
              id: true,
              sourceIp: true,
              count: true,
              disposition: true,
              dkim: true,
              spf: true,
              headerFrom: true,
              spfAuthResult: true,
              dkimAuthResult: true,
              geoLocation: { select: { country: true } },
            },
          },
        },
      },
    },
  })

  if (!record) {
    throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  }

  const siblings: SiblingRecord[] = record.report.records
    .filter(r => r.id !== id)
    .map(r => ({
      id: r.id,
      sourceIp: r.sourceIp,
      count: r.count,
      disposition: r.disposition,
      dkim: r.dkim,
      spf: r.spf,
      headerFrom: r.headerFrom,
      country: r.geoLocation?.country ?? null,
      spfAuthResult: r.spfAuthResult,
      dkimAuthResult: r.dkimAuthResult,
    }))

  return {
    id: record.id,
    sourceIp: record.sourceIp,
    count: record.count,
    disposition: record.disposition,
    dkim: record.dkim,
    spf: record.spf,
    headerFrom: record.headerFrom,
    spfAuthDomain: record.spfAuthDomain,
    spfAuthResult: record.spfAuthResult,
    dkimAuthDomain: record.dkimAuthDomain,
    dkimAuthSelector: record.dkimAuthSelector,
    dkimAuthResult: record.dkimAuthResult,
    dmarcCompliant: record.dkim === 'pass' || record.spf === 'pass',
    geo: record.geoLocation
      ? {
          country: record.geoLocation.country,
          city: record.geoLocation.city,
          latitude: record.geoLocation.latitude,
          longitude: record.geoLocation.longitude,
        }
      : null,
    report: {
      id: record.report.id,
      orgReportId: record.report.reportId,
      orgName: record.report.orgName,
      dateBegin: record.report.dateBegin.toISOString(),
      dateEnd: record.report.dateEnd.toISOString(),
      domainName: record.report.domain.name,
      inboxLabel: record.report.inbox.label,
      rawXml: record.report.rawXml,
      policyP: record.report.policyP,
      policySp: record.report.policySp,
      policyAdkim: record.report.policyAdkim,
      policyAspf: record.report.policyAspf,
      policyPct: record.report.policyPct,
    },
    siblings,
  }
})
