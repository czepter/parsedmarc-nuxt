import type { ParsedMail } from 'mailparser'

export interface ParsedForensicReport {
  arrivalDate: Date
  sourceIp: string
  subject: string
  domain: string
}

/**
 * Extract a plain string value from a mailparser header entry.
 * mailparser can return HeaderValue as string | string[] | Date | AddressObject | etc.
 */
function headerString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim()
  return ''
}

/**
 * Parse a DMARC forensic (AFRF) report from an already-parsed email.
 *
 * The caller (ingest.ts) has already run simpleParser on the raw message.
 * This function extracts arrival date, source IP, subject, and domain from
 * the MIME headers and address fields.
 */
export function parseForensic(parsed: ParsedMail): ParsedForensicReport {
  const headers = parsed.headers as Map<string, unknown>

  // Source-IP — set by the MTA that generates the AFRF
  const sourceIp = headerString(headers.get('source-ip'))

  // Arrival-Date — when the offending message arrived at the receiver
  const arrivalDateRaw = headers.get('arrival-date')
  let arrivalDate: Date
  if (arrivalDateRaw) {
    const parsed_ = new Date(headerString(arrivalDateRaw))
    arrivalDate = isNaN(parsed_.getTime()) ? (parsed.date ?? new Date()) : parsed_
  }
  else {
    arrivalDate = parsed.date ?? new Date()
  }

  // Subject — the outer AFRF wrapper's own subject line
  const subject = parsed.subject ?? ''

  // Domain — prefer Reported-Domain: header (RFC 6591 §3.1)
  // Fall back to extracting from the To: address (e.g. dmarc+ruf@example.com)
  const reportedDomain = headerString(headers.get('reported-domain'))
  let domain = reportedDomain

  if (!domain) {
    // Try To: address
    const toAddress =
      (parsed.to as { value?: Array<{ address?: string }> } | undefined)?.value?.[0]?.address ?? ''
    const match = /@([^>@\s]+)/.exec(toAddress)
    domain = match?.[1] ?? ''
  }

  return { arrivalDate, sourceIp, subject, domain }
}