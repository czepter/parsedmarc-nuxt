import { describe, it, expect } from 'vitest'
import { parseForensic } from '../../../lib/dmarc/forensic'
import type { ParsedMail } from 'mailparser'

function makeParsedMail(overrides: Partial<{
  headers: Record<string, string>
  subject: string
  to: string
  date: Date
}>): ParsedMail {
  const h = new Map<string, unknown>()
  for (const [k, v] of Object.entries(overrides.headers ?? {})) {
    h.set(k.toLowerCase(), v)
  }
  return {
    headers: h,
    subject: overrides.subject ?? 'Forensic report',
    date: overrides.date ?? new Date('2024-01-02T10:00:00Z'),
    to: overrides.to ? { value: [{ address: overrides.to, name: '' }], text: overrides.to, html: overrides.to } : undefined,
    attachments: [],
    text: '',
    html: '',
    from: undefined,
    cc: undefined,
    bcc: undefined,
    replyTo: undefined,
    references: [],
    messageId: '',
  } as unknown as ParsedMail
}

describe('parseForensic', () => {
  it('extracts source IP and arrival date from MIME headers', () => {
    const parsed = makeParsedMail({
      headers: {
        'source-ip': '203.0.113.42',
        'arrival-date': 'Tue, 02 Jan 2024 12:34:56 +0000',
        'reported-domain': 'example.com',
      },
      subject: '[DMARC FAIL] Failure from 203.0.113.42',
    })
    const report = parseForensic(parsed)
    expect(report.sourceIp).toBe('203.0.113.42')
    expect(report.subject).toBe('[DMARC FAIL] Failure from 203.0.113.42')
    expect(report.domain).toBe('example.com')
    expect(report.arrivalDate).toBeInstanceOf(Date)
  })

  it('falls back to parsed.date when arrival-date header is absent', () => {
    const fallbackDate = new Date('2024-01-02T08:00:00Z')
    const parsed = makeParsedMail({
      headers: { 'source-ip': '1.2.3.4', 'reported-domain': 'example.com' },
      date: fallbackDate,
    })
    const report = parseForensic(parsed)
    expect(report.arrivalDate.toISOString()).toBe(fallbackDate.toISOString())
  })

  it('extracts domain from To: header when reported-domain is absent', () => {
    const parsed = makeParsedMail({
      headers: { 'source-ip': '5.6.7.8' },
      to: 'dmarc+ruf@example.org',
    })
    const report = parseForensic(parsed)
    expect(report.domain).toBe('example.org')
  })

  it('uses empty string for sourceIp when header is absent', () => {
    const parsed = makeParsedMail({
      headers: { 'reported-domain': 'example.com' },
    })
    const report = parseForensic(parsed)
    expect(report.sourceIp).toBe('')
  })

  it('uses empty string for domain when no domain can be extracted', () => {
    const parsed = makeParsedMail({ headers: { 'source-ip': '1.2.3.4' } })
    const report = parseForensic(parsed)
    expect(report.domain).toBe('')
  })
})
