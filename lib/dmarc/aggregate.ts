import { XMLParser } from 'fast-xml-parser'
import { gunzipSync, unzipSync, strFromU8 } from 'fflate'
import type { Attachment } from 'mailparser'

export interface ParsedAggregateRecord {
  sourceIp: string
  count: number
  disposition: string
  dkim: string
  spf: string
  headerFrom: string
}

export interface ParsedAggregateReport {
  reportId: string
  orgName: string
  domain: string
  dateBegin: Date
  dateEnd: Date
  records: ParsedAggregateRecord[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Always produce an array for <record> elements, even when there is only one.
  // Without this, a single-record report parses as a plain object, not an array.
  isArray: (name) => name === 'record',
})

/**
 * Decompress an attachment content buffer to a UTF-8 XML string.
 * Supports: plain .xml, .gz / .xml.gz, .zip / .xml.zip
 */
function decompress(content: Buffer, filename: string): string {
  const lc = filename.toLowerCase()
  if (lc.endsWith('.gz')) {
    const decompressed = gunzipSync(new Uint8Array(content))
    return strFromU8(decompressed)
  }
  if (lc.endsWith('.zip')) {
    const files = unzipSync(new Uint8Array(content))
    const entries = Object.values(files)
    if (entries.length === 0) throw new Error(`ZIP archive in ${filename} contains no files`)
    // DMARC zips contain exactly one XML file — take the first entry.
    return strFromU8(entries[0])
  }
  // Plain XML (or any other extension — try treating as raw UTF-8)
  return content.toString('utf-8')
}

/**
 * Parse a DMARC aggregate report from an email attachment.
 *
 * @param attachment  A mailparser Attachment with a `content` Buffer and `filename`.
 * @returns           Typed ParsedAggregateReport, or throws if parsing fails.
 */
export function parseAggregate(attachment: Attachment): ParsedAggregateReport {
  const xmlString = decompress(attachment.content as Buffer, attachment.filename ?? '')
  // fast-xml-parser throws a structured error on invalid XML.
  const doc = parser.parse(xmlString)

  const fb = doc?.feedback
  if (!fb) throw new Error('XML does not contain a <feedback> root element')
  if (!fb.policy_published) throw new Error('Malformed DMARC report: missing <policy_published>')

  const meta = fb.report_metadata
  const policy = fb.policy_published

  const reportId = String(meta?.report_id ?? '')
  const orgName = String(meta?.org_name ?? '')
  const domain = String(policy?.domain ?? '')
  const dateBegin = new Date(Number(meta?.date_range?.begin ?? 0) * 1000)
  const dateEnd = new Date(Number(meta?.date_range?.end ?? 0) * 1000)

  // fb.record is always an array due to isArray config, but guard anyway
  const rawRecords: unknown[] = Array.isArray(fb.record) ? fb.record : fb.record ? [fb.record] : []

  const records: ParsedAggregateRecord[] = rawRecords.map((r: unknown) => {
    const rec = r as Record<string, unknown>
    const row = rec.row as Record<string, unknown>
    const evaluated = row?.policy_evaluated as Record<string, unknown> | undefined
    const identifiers = rec.identifiers as Record<string, unknown> | undefined

    return {
      sourceIp: String(row?.source_ip ?? ''),
      count: Number(row?.count ?? 0),
      disposition: String(evaluated?.disposition ?? ''),
      dkim: String(evaluated?.dkim ?? ''),
      spf: String(evaluated?.spf ?? ''),
      headerFrom: String(identifiers?.header_from ?? ''),
    }
  })

  return { reportId, orgName, domain, dateBegin, dateEnd, records }
}
