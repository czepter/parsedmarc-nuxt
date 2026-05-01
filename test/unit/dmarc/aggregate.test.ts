import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAggregate } from '../../../lib/dmarc/aggregate'
import type { Attachment } from 'mailparser'

const FIXTURES = join(process.cwd(), 'test', 'fixtures', 'dmarc')

function xmlAttachment(filename: string): Attachment {
  const content = readFileSync(join(FIXTURES, filename))
  return {
    filename,
    content,
    contentType: 'text/xml',
    contentDisposition: 'attachment',
    headers: new Map(),
    checksum: '',
    size: content.length,
    type: 'attachment',
  } as unknown as Attachment
}

describe('parseAggregate', () => {
  it('parses Google fixture (plain XML)', () => {
    const att = xmlAttachment('google.xml')
    const report = parseAggregate(att)
    expect(report.orgName).toBe('Google Inc.')
    expect(report.reportId).toBe('12345678901234567890')
    expect(report.domain).toBe('example.com')
    expect(report.dateBegin).toEqual(new Date(1704067200 * 1000))
    expect(report.dateEnd).toEqual(new Date(1704153600 * 1000))
    expect(report.records).toHaveLength(1)
    expect(report.records[0]).toMatchObject({
      sourceIp: '209.85.220.41',
      count: 12,
      disposition: 'none',
      dkim: 'pass',
      spf: 'pass',
      headerFrom: 'example.com',
    })
  })

  it('parses Microsoft fixture (two records)', () => {
    const att = xmlAttachment('microsoft.xml')
    const report = parseAggregate(att)
    expect(report.orgName).toBe('Outlook.com')
    expect(report.records).toHaveLength(2)
    expect(report.records[1]).toMatchObject({
      sourceIp: '185.220.101.5',
      count: 47,
      disposition: 'quarantine',
      dkim: 'fail',
      spf: 'pass',
    })
  })

  it('parses Yahoo fixture (strict aspf, quarantine)', () => {
    const att = xmlAttachment('yahoo.xml')
    const report = parseAggregate(att)
    expect(report.orgName).toBe('Yahoo! Inc.')
    expect(report.records[0].disposition).toBe('quarantine')
    expect(report.records[0].dkim).toBe('fail')
    expect(report.records[0].spf).toBe('fail')
  })

  it('parses Mail.ru fixture (high count, both fail)', () => {
    const att = xmlAttachment('mailru.xml')
    const report = parseAggregate(att)
    expect(report.orgName).toBe('Mail.RU')
    expect(report.records[0].count).toBe(88)
    expect(report.records[0].dkim).toBe('fail')
    expect(report.records[0].spf).toBe('fail')
  })

  it('throws on malformed XML', () => {
    const att = xmlAttachment('malformed.xml')
    expect(() => parseAggregate(att)).toThrow()
  })

  it('parses gzip-compressed XML', () => {
    const xml = readFileSync(join(FIXTURES, 'google.xml'))
    const zlib = require('node:zlib')
    const gzContent = zlib.gzipSync(xml) as Buffer
    const att = {
      filename: 'google_report.xml.gz',
      content: gzContent,
      contentType: 'application/gzip',
      contentDisposition: 'attachment',
      headers: new Map(),
      checksum: '',
      size: gzContent.length,
      type: 'attachment',
    } as unknown as Attachment
    const report = parseAggregate(att)
    expect(report.orgName).toBe('Google Inc.')
    expect(report.records).toHaveLength(1)
  })

  it('parses zip-compressed XML', () => {
    const xml = readFileSync(join(FIXTURES, 'google.xml'))
    const { zipSync, strToU8 } = require('fflate')
    const zipContent = zipSync({ 'google_report.xml': strToU8(xml.toString('utf-8')) }) as Uint8Array
    const att = {
      filename: 'google_report.xml.zip',
      content: Buffer.from(zipContent),
      contentType: 'application/zip',
      contentDisposition: 'attachment',
      headers: new Map(),
      checksum: '',
      size: zipContent.byteLength,
      type: 'attachment',
    } as unknown as Attachment
    const report = parseAggregate(att)
    expect(report.orgName).toBe('Google Inc.')
  })
})
