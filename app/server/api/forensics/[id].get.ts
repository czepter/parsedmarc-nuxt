import prisma from '~~/lib/prisma'

interface ForensicDetailResponse {
  id: string
  domainName: string
  arrivalDate: string
  sourceIp: string
  subject: string
  rawEml: string
  // Note: all forensic reports contain PII (original email headers) — the page always shows
  // the PII badge. A future scrubbing feature can add a boolean field here.
}

export default defineEventHandler(async (event): Promise<ForensicDetailResponse> => {
  const { id } = getRouterParams(event)

  const report = await prisma.forensicReport.findUnique({
    where: { id },
    select: {
      id: true,
      arrivalDate: true,
      sourceIp: true,
      subject: true,
      rawEml: true,
      domain: { select: { name: true } },
    },
  })

  if (!report) {
    throw createError({ statusCode: 404, statusMessage: 'Forensic report not found' })
  }

  return {
    id: report.id,
    domainName: report.domain.name,
    arrivalDate: report.arrivalDate.toISOString(),
    sourceIp: report.sourceIp,
    subject: report.subject,
    rawEml: report.rawEml,
  }
})
