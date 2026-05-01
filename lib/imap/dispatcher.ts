import type { ParsedMail, Attachment } from 'mailparser'

export type MessageClass = 'aggregate' | 'forensic' | 'unknown'

/** Filename suffixes that indicate a DMARC aggregate report attachment. */
const AGGREGATE_SUFFIXES = ['.xml', '.xml.gz', '.xml.zip', '.zip']

/** ContentType values that, combined with the filename check, indicate aggregate. */
const AGGREGATE_CONTENT_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-gzip',
  'application/octet-stream',
  'text/xml',
  'application/xml',
])

function isAggregateAttachment(att: Attachment): boolean {
  const fn = (att.filename ?? '').toLowerCase()
  if (AGGREGATE_SUFFIXES.some(s => fn.endsWith(s))) return true
  // No recognizable extension — fall back to content type for octet-stream blobs
  // that many senders mislabel but name correctly
  if (AGGREGATE_CONTENT_TYPES.has(att.contentType?.toLowerCase() ?? '') && fn.includes('xml')) {
    return true
  }
  return false
}

/**
 * Classify a parsed email as aggregate, forensic, or unknown.
 *
 * No I/O is performed — this is a pure classification based on attachment
 * filenames and message headers.
 *
 * Aggregate check runs before forensic check. If a message has both an XML
 * attachment and forensic headers (pathological edge case), it is classified
 * as aggregate so the attachment is not discarded.
 */
export function classifyMail(parsed: ParsedMail): MessageClass {
  // 1. Aggregate: has at least one attachment that looks like a DMARC report
  const attachments = (parsed.attachments ?? []) as Attachment[]
  if (attachments.some(isAggregateAttachment)) return 'aggregate'

  // 2. Forensic: feedback-type header present (RFC 6591) OR content-type
  //    contains 'report-type=feedback-report' (RFC 6522)
  const headers = parsed.headers as Map<string, unknown>
  const feedbackType = headers.get('feedback-type')
  if (typeof feedbackType === 'string' && feedbackType.trim() !== '') return 'forensic'

  const contentType = headers.get('content-type')
  const ctStr = typeof contentType === 'string' ? contentType : ''
  if (ctStr.includes('report-type=feedback-report')) return 'forensic'

  return 'unknown'
}
