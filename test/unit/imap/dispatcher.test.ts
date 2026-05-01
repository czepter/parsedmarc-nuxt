import { describe, it, expect } from 'vitest'
import { classifyMail } from '../../../lib/imap/dispatcher'
import type { ParsedMail, Attachment } from 'mailparser'

function makeMail(opts: {
  attachments?: Partial<Attachment>[]
  headers?: Record<string, string>
}): ParsedMail {
  const h = new Map<string, unknown>()
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    h.set(k.toLowerCase(), v)
  }
  return {
    headers: h,
    attachments: (opts.attachments ?? []) as Attachment[],
    subject: '',
    date: new Date(),
    text: '',
    html: '',
    from: undefined,
    to: undefined,
  } as unknown as ParsedMail
}

describe('classifyMail', () => {
  it('classifies .xml attachment as aggregate', () => {
    const mail = makeMail({ attachments: [{ filename: 'report.xml', contentType: 'text/xml' }] })
    expect(classifyMail(mail)).toBe('aggregate')
  })

  it('classifies .xml.gz attachment as aggregate', () => {
    const mail = makeMail({ attachments: [{ filename: 'google.com!example.com!123!456.xml.gz', contentType: 'application/gzip' }] })
    expect(classifyMail(mail)).toBe('aggregate')
  })

  it('classifies .xml.zip attachment as aggregate', () => {
    const mail = makeMail({ attachments: [{ filename: 'report.xml.zip', contentType: 'application/zip' }] })
    expect(classifyMail(mail)).toBe('aggregate')
  })

  it('classifies .zip attachment (DMARC zip without .xml in name) as aggregate', () => {
    const mail = makeMail({ attachments: [{ filename: 'dmarc_report.zip', contentType: 'application/zip' }] })
    expect(classifyMail(mail)).toBe('aggregate')
  })

  it('classifies message with feedback-type header as forensic', () => {
    const mail = makeMail({ headers: { 'feedback-type': 'auth-failure' } })
    expect(classifyMail(mail)).toBe('forensic')
  })

  it('classifies message with feedback-type=abuse as forensic', () => {
    const mail = makeMail({ headers: { 'feedback-type': 'abuse' } })
    expect(classifyMail(mail)).toBe('forensic')
  })

  it('classifies multipart/report with feedback-report content-type as forensic', () => {
    const mail = makeMail({
      headers: { 'content-type': 'multipart/report; report-type=feedback-report; boundary="abc"' },
    })
    expect(classifyMail(mail)).toBe('forensic')
  })

  it('classifies unrecognized message as unknown', () => {
    const mail = makeMail({ attachments: [{ filename: 'invoice.pdf', contentType: 'application/pdf' }] })
    expect(classifyMail(mail)).toBe('unknown')
  })

  it('classifies message with no attachments and no forensic headers as unknown', () => {
    const mail = makeMail({})
    expect(classifyMail(mail)).toBe('unknown')
  })

  it('prefers aggregate when message has both an xml attachment and a feedback-type header', () => {
    // Aggregate check runs first — such a message is rare but should resolve deterministically
    const mail = makeMail({
      attachments: [{ filename: 'report.xml', contentType: 'text/xml' }],
      headers: { 'feedback-type': 'auth-failure' },
    })
    expect(classifyMail(mail)).toBe('aggregate')
  })
})
