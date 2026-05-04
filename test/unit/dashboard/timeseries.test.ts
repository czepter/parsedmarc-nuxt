import { describe, it, expect } from 'vitest'

type Granularity = 'hour' | 'day' | 'week'

function pickGranularity(windowSeconds: number): Granularity {
  if (windowSeconds <= 2 * 24 * 3600) return 'hour'
  if (windowSeconds <= 90 * 24 * 3600) return 'day'
  return 'week'
}

function bucketToUnix(b: string, granularity: Granularity): number {
  if (granularity === 'week') {
    const [year, week] = b.split('-').map(Number)
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const weekStart = new Date(jan4)
    weekStart.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7)
    return Math.floor(weekStart.getTime() / 1000)
  }
  return Math.floor(new Date(b + 'Z').getTime() / 1000)
}

describe('pickGranularity', () => {
  it('returns hour for 24h window', () => {
    expect(pickGranularity(86400)).toBe('hour')
  })

  it('returns hour for 2-day window (boundary)', () => {
    expect(pickGranularity(2 * 86400)).toBe('hour')
  })

  it('returns day for 7-day window', () => {
    expect(pickGranularity(7 * 86400)).toBe('day')
  })

  it('returns day for 90-day window (boundary)', () => {
    expect(pickGranularity(90 * 86400)).toBe('day')
  })

  it('returns week for window beyond 90 days', () => {
    expect(pickGranularity(91 * 86400)).toBe('week')
  })
})

describe('bucketToUnix', () => {
  it('parses hourly bucket to correct unix seconds', () => {
    const ts = bucketToUnix('2024-01-15T14:00:00', 'hour')
    expect(ts).toBe(new Date('2024-01-15T14:00:00Z').getTime() / 1000)
  })

  it('parses daily bucket to correct unix seconds', () => {
    const ts = bucketToUnix('2024-01-15T00:00:00', 'day')
    expect(ts).toBe(new Date('2024-01-15T00:00:00Z').getTime() / 1000)
  })

  it('parses week bucket — week 1 of 2024', () => {
    const ts = bucketToUnix('2024-01', 'week')
    expect(ts).toBe(new Date('2024-01-01T00:00:00Z').getTime() / 1000)
  })
})
