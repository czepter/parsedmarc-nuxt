import { describe, it, expect } from 'vitest'

interface DispositionGroup {
  disposition: string
  count: number
}

function buildBreakdown(
  groups: DispositionGroup[],
  totalMessages: number,
): Array<{ disposition: string; count: number; pct: number }> {
  return groups.map(g => ({
    disposition: g.disposition,
    count: g.count,
    pct: totalMessages > 0
      ? Math.round((g.count / totalMessages) * 1000) / 10
      : 0,
  }))
}

function sumGroups(groups: DispositionGroup[]): number {
  return groups.reduce((acc, g) => acc + g.count, 0)
}

describe('buildBreakdown', () => {
  it('computes 100% for single disposition', () => {
    const result = buildBreakdown([{ disposition: 'none', count: 200 }], 200)
    expect(result[0].pct).toBe(100)
  })

  it('computes correct percentages for mixed dispositions', () => {
    const groups = [
      { disposition: 'none', count: 90 },
      { disposition: 'reject', count: 10 },
    ]
    const result = buildBreakdown(groups, 100)
    expect(result.find(r => r.disposition === 'none')?.pct).toBe(90)
    expect(result.find(r => r.disposition === 'reject')?.pct).toBe(10)
  })

  it('returns 0 pct when totalMessages is 0', () => {
    const result = buildBreakdown([{ disposition: 'none', count: 0 }], 0)
    expect(result[0].pct).toBe(0)
  })

  it('rounds to one decimal place', () => {
    const groups = [{ disposition: 'none', count: 1 }]
    const result = buildBreakdown(groups, 3)
    expect(result[0].pct).toBe(33.3)
  })
})

describe('sumGroups', () => {
  it('sums counts correctly', () => {
    expect(sumGroups([
      { disposition: 'none', count: 100 },
      { disposition: 'reject', count: 50 },
    ])).toBe(150)
  })

  it('returns 0 for empty array', () => {
    expect(sumGroups([])).toBe(0)
  })
})
