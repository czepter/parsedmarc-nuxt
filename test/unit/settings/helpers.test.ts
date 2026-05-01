import { describe, it, expect } from 'vitest'

// Pure helper extracted from backup.get.ts
function backupFilename(date: Date): string {
  return `parsedmarc-${date.toISOString().slice(0, 10)}.db`
}

// Pure helper extracted from status.get.ts
function mmdbAgeDays(mtimeMs: number, nowMs: number): number {
  return Math.floor((nowMs - mtimeMs) / (24 * 60 * 60 * 1000))
}

function mmdbIsStale(ageDays: number): boolean {
  return ageDays > 35
}

describe('backupFilename', () => {
  it('formats filename as parsedmarc-YYYY-MM-DD.db', () => {
    const d = new Date('2026-05-01T14:30:00Z')
    expect(backupFilename(d)).toBe('parsedmarc-2026-05-01.db')
  })

  it('zero-pads month and day', () => {
    const d = new Date('2026-01-07T00:00:00Z')
    expect(backupFilename(d)).toBe('parsedmarc-2026-01-07.db')
  })

  it('always ends with .db', () => {
    expect(backupFilename(new Date('2026-12-31T00:00:00Z'))).toMatch(/\.db$/)
  })
})

describe('mmdbAgeDays', () => {
  it('returns 0 for a file modified now', () => {
    const now = Date.now()
    expect(mmdbAgeDays(now, now)).toBe(0)
  })

  it('returns 1 for a file modified 25 hours ago', () => {
    const now = Date.now()
    const mtime = now - 25 * 60 * 60 * 1000
    expect(mmdbAgeDays(mtime, now)).toBe(1)
  })

  it('returns 35 for exactly 35 days ago', () => {
    const now = Date.now()
    const mtime = now - 35 * 24 * 60 * 60 * 1000
    expect(mmdbAgeDays(mtime, now)).toBe(35)
  })

  it('floors partial days', () => {
    const now = Date.now()
    const mtime = now - 1.9 * 24 * 60 * 60 * 1000
    expect(mmdbAgeDays(mtime, now)).toBe(1)
  })
})

describe('mmdbIsStale', () => {
  it('returns false for 35 days', () => {
    expect(mmdbIsStale(35)).toBe(false)
  })

  it('returns true for 36 days', () => {
    expect(mmdbIsStale(36)).toBe(true)
  })

  it('returns false for 0 days', () => {
    expect(mmdbIsStale(0)).toBe(false)
  })
})
