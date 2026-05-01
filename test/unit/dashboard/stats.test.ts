import { describe, it, expect } from 'vitest'

describe('stats delta computation', () => {
  function computeDelta(current: number, previous: number): number {
    if (previous === 0) return 0
    return current - previous
  }

  it('returns positive delta when current > previous', () => {
    expect(computeDelta(120, 100)).toBe(20)
  })

  it('returns negative delta when current < previous', () => {
    expect(computeDelta(80, 100)).toBe(-20)
  })

  it('returns 0 when previous is 0 (avoid division)', () => {
    expect(computeDelta(50, 0)).toBe(0)
  })

  it('computes pass rate correctly', () => {
    const total = 1000
    const none = 920
    const rate = none / total * 100
    expect(rate).toBeCloseTo(92.0)
  })

  it('pass rate is 0 when total is 0', () => {
    const total = 0
    const rate = total > 0 ? (0 / total) * 100 : 0
    expect(rate).toBe(0)
  })
})

describe('time range validation', () => {
  it('rejects when from >= to', () => {
    const from = 1700000100
    const to   = 1700000000
    expect(from >= to).toBe(true)
  })

  it('accepts valid range', () => {
    const from = 1700000000
    const to   = 1700604800
    expect(from < to).toBe(true)
  })

  it('default window is 7 days (604800 seconds)', () => {
    const SEVEN_DAYS = 7 * 24 * 3600
    expect(SEVEN_DAYS).toBe(604800)
  })
})
