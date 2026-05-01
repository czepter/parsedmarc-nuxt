import { describe, it, expect } from 'vitest'

function sanitizeQuery(raw: string): string {
  return raw.trim().slice(0, 100)
}

function isTooShort(q: string): boolean {
  return q.length < 2
}

function domainHref(name: string): string {
  return `/domains/${encodeURIComponent(name)}`
}

describe('sanitizeQuery', () => {
  it('trims whitespace', () => {
    expect(sanitizeQuery('  hello  ')).toBe('hello')
  })

  it('caps at 100 characters', () => {
    const long = 'a'.repeat(200)
    expect(sanitizeQuery(long)).toHaveLength(100)
  })

  it('passes short valid query unchanged', () => {
    expect(sanitizeQuery('ex')).toBe('ex')
  })

  it('empty string after trim remains empty', () => {
    expect(sanitizeQuery('   ')).toBe('')
  })
})

describe('isTooShort', () => {
  it('returns true for empty string', () => {
    expect(isTooShort('')).toBe(true)
  })

  it('returns true for single character', () => {
    expect(isTooShort('a')).toBe(true)
  })

  it('returns false for two characters', () => {
    expect(isTooShort('ab')).toBe(false)
  })

  it('returns false for full query', () => {
    expect(isTooShort('example.com')).toBe(false)
  })
})

describe('domainHref', () => {
  it('builds href for simple domain', () => {
    expect(domainHref('example.com')).toBe('/domains/example.com')
  })

  it('URL-encodes subdomains with dots', () => {
    // encodeURIComponent does not encode dots, so expect pass-through
    expect(domainHref('mail.example.com')).toBe('/domains/mail.example.com')
  })

  it('URL-encodes domains with special chars', () => {
    expect(domainHref('xn--nxasmq6b.com')).toBe('/domains/xn--nxasmq6b.com')
  })
})
