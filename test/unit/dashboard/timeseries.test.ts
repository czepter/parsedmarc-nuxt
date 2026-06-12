import { describe, it, expect } from 'vitest'

type Granularity = 'hour' | 'day' | 'week' | 'month'

function pickGranularity(windowSeconds: number): Granularity {
  const day = 24 * 3600
  if (windowSeconds <= 2 * day) return 'hour'
  if (windowSeconds <= 31 * day) return 'day'
  if (windowSeconds <= 200 * day) return 'week'
  return 'month'
}

function bucketToUnix(b: string, granularity: Granularity): number {
  if (granularity === 'week') {
    const [year, week] = b.split('-').map(Number)
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const weekStart = new Date(jan4)
    weekStart.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7)
    return Math.floor(weekStart.getTime() / 1000)
  }
  if (granularity === 'month') {
    const [year, month] = b.split('-').map(Number)
    return Math.floor(Date.UTC(year, month - 1, 1) / 1000)
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

  it('returns day for 30-day window', () => {
    expect(pickGranularity(30 * 86400)).toBe('day')
  })

  it('returns week for 90-day window', () => {
    expect(pickGranularity(90 * 86400)).toBe('week')
  })

  it('returns week for 6-month window (~182 days)', () => {
    expect(pickGranularity(182 * 86400)).toBe('week')
  })

  it('returns month for 12-month window (~365 days)', () => {
    expect(pickGranularity(365 * 86400)).toBe('month')
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

  it('parses month bucket — May 2024', () => {
    const ts = bucketToUnix('2024-05', 'month')
    expect(ts).toBe(new Date('2024-05-01T00:00:00Z').getTime() / 1000)
  })
})
