import { describe, it, expect } from 'vitest'
import {
  parseDmarcRecord,
  parseSpfRecord,
  parseDkimRecord,
  joinTxtChunks,
  findRecord,
  sortMxRecords,
} from '../../../app/server/utils/dns-lookup-parsers'

describe('joinTxtChunks', () => {
  it('joins an array of strings into one record (DNS TXT chunks)', () => {
    expect(joinTxtChunks(['v=DMARC1', '; p=none'])).toBe('v=DMARC1; p=none')
  })
  it('handles a single chunk', () => {
    expect(joinTxtChunks(['v=DMARC1; p=none'])).toBe('v=DMARC1; p=none')
  })
  it('handles empty', () => {
    expect(joinTxtChunks([])).toBe('')
  })
})

describe('findRecord', () => {
  it('finds a record matching the prefix', () => {
    const txts = [['ignore=me'], ['v=DMARC1', '; p=none']]
    expect(findRecord(txts, 'v=DMARC1')).toBe('v=DMARC1; p=none')
  })
  it('returns null if no record matches', () => {
    expect(findRecord([['x=y']], 'v=DMARC1')).toBeNull()
  })
})

describe('parseDmarcRecord', () => {
  it('parses a basic record', () => {
    const r = parseDmarcRecord('v=DMARC1; p=none; rua=mailto:agg@example.com')
    expect(r.policy).toBe('none')
    expect(r.rua).toBe('mailto:agg@example.com')
  })

  it('parses a complete record with all tags', () => {
    const r = parseDmarcRecord(
      'v=DMARC1; p=quarantine; sp=reject; pct=50; rua=mailto:a@x.com,mailto:b@x.com; ruf=mailto:f@x.com; aspf=s; adkim=r; fo=1',
    )
    expect(r.policy).toBe('quarantine')
    expect(r.subdomainPolicy).toBe('reject')
    expect(r.pct).toBe(50)
    expect(r.rua).toBe('mailto:a@x.com,mailto:b@x.com')
    expect(r.ruf).toBe('mailto:f@x.com')
    expect(r.aspf).toBe('s')
    expect(r.adkim).toBe('r')
    expect(r.fo).toBe('1')
  })

  it('tolerates whitespace and trailing semicolons', () => {
    const r = parseDmarcRecord('v=DMARC1 ;  p=reject ;')
    expect(r.policy).toBe('reject')
  })

  it('returns null pct when not numeric', () => {
    const r = parseDmarcRecord('v=DMARC1; p=none; pct=abc')
    expect(r.pct).toBeNull()
  })

  it('omits missing optional tags as null', () => {
    const r = parseDmarcRecord('v=DMARC1; p=none')
    expect(r.subdomainPolicy).toBeNull()
    expect(r.pct).toBeNull()
    expect(r.rua).toBeNull()
  })
})

describe('parseSpfRecord', () => {
  it('parses a basic record with -all', () => {
    const r = parseSpfRecord('v=spf1 include:_spf.google.com -all')
    expect(r.qualifierAll).toBe('-all')
    expect(r.includeCount).toBe(1)
  })

  it('counts multiple includes', () => {
    const r = parseSpfRecord('v=spf1 include:a.com include:b.com include:c.com ~all')
    expect(r.includeCount).toBe(3)
    expect(r.qualifierAll).toBe('~all')
  })

  it('detects ?all', () => {
    const r = parseSpfRecord('v=spf1 a mx ?all')
    expect(r.qualifierAll).toBe('?all')
  })

  it('detects +all (most permissive)', () => {
    const r = parseSpfRecord('v=spf1 +all')
    expect(r.qualifierAll).toBe('+all')
    expect(r.includeCount).toBe(0)
  })

  it('handles bare all (defaults to +all per RFC)', () => {
    const r = parseSpfRecord('v=spf1 mx all')
    expect(r.qualifierAll).toBe('+all')
  })

  it('handles missing all qualifier', () => {
    const r = parseSpfRecord('v=spf1 mx')
    expect(r.qualifierAll).toBeNull()
  })

  it('preserves the raw mechanisms string', () => {
    const r = parseSpfRecord('v=spf1 ip4:1.2.3.4 -all')
    expect(r.mechanisms).toBe('ip4:1.2.3.4 -all')
  })
})

describe('parseDkimRecord', () => {
  it('parses a typical RSA key', () => {
    const r = parseDkimRecord('v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4...')
    expect(r.keyType).toBe('rsa')
    expect(r.publicKey).toContain('MIGfMA0GCSqGSIb3DQEBAQUA')
    expect(r.hasKey).toBe(true)
  })

  it('detects revoked key (empty p=)', () => {
    const r = parseDkimRecord('v=DKIM1; k=rsa; p=')
    expect(r.publicKey).toBe('')
    expect(r.hasKey).toBe(false)
  })

  it('detects missing p tag', () => {
    const r = parseDkimRecord('v=DKIM1; k=rsa')
    expect(r.publicKey).toBeNull()
    expect(r.hasKey).toBe(false)
  })

  it('defaults keyType to null when missing', () => {
    const r = parseDkimRecord('v=DKIM1; p=ABC')
    expect(r.keyType).toBeNull()
    expect(r.hasKey).toBe(true)
  })
})

describe('sortMxRecords', () => {
  it('sorts ascending by priority', () => {
    const sorted = sortMxRecords([
      { priority: 20, exchange: 'mx2.example.com' },
      { priority: 10, exchange: 'mx1.example.com' },
      { priority: 30, exchange: 'mx3.example.com' },
    ])
    expect(sorted.map(r => r.priority)).toEqual([10, 20, 30])
  })

  it('handles empty array', () => {
    expect(sortMxRecords([])).toEqual([])
  })

  it('keeps stable order for equal priorities', () => {
    const sorted = sortMxRecords([
      { priority: 10, exchange: 'b.com' },
      { priority: 10, exchange: 'a.com' },
    ])
    expect(sorted.map(r => r.exchange)).toEqual(['b.com', 'a.com'])
  })
})
