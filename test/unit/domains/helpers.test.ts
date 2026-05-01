import { describe, it, expect } from 'vitest'

function collapseIpGroups(
  groups: Array<{ sourceIp: string; disposition: string; count: number }>,
): Map<string, { total: number; pass: number }> {
  const ipMap = new Map<string, { total: number; pass: number }>()
  for (const g of groups) {
    const entry = ipMap.get(g.sourceIp) ?? { total: 0, pass: 0 }
    entry.total += g.count
    if (g.disposition === 'none') entry.pass += g.count
    ipMap.set(g.sourceIp, entry)
  }
  return ipMap
}

function computePassRate(pass: number, total: number): number {
  if (total === 0) return 0
  return Math.round((pass / total) * 1000) / 10
}

describe('collapseIpGroups', () => {
  it('sums counts for the same IP across dispositions', () => {
    const groups = [
      { sourceIp: '1.2.3.4', disposition: 'none', count: 80 },
      { sourceIp: '1.2.3.4', disposition: 'reject', count: 20 },
    ]
    const result = collapseIpGroups(groups)
    expect(result.get('1.2.3.4')?.total).toBe(100)
  })

  it('counts only "none" disposition as pass', () => {
    const groups = [
      { sourceIp: '1.2.3.4', disposition: 'none', count: 80 },
      { sourceIp: '1.2.3.4', disposition: 'quarantine', count: 10 },
      { sourceIp: '1.2.3.4', disposition: 'reject', count: 10 },
    ]
    const result = collapseIpGroups(groups)
    expect(result.get('1.2.3.4')?.pass).toBe(80)
  })

  it('handles multiple IPs independently', () => {
    const groups = [
      { sourceIp: '1.1.1.1', disposition: 'none', count: 50 },
      { sourceIp: '2.2.2.2', disposition: 'reject', count: 30 },
    ]
    const result = collapseIpGroups(groups)
    expect(result.get('1.1.1.1')?.total).toBe(50)
    expect(result.get('2.2.2.2')?.total).toBe(30)
    expect(result.get('2.2.2.2')?.pass).toBe(0)
  })

  it('returns empty map for empty input', () => {
    expect(collapseIpGroups([])).toEqual(new Map())
  })
})

describe('computePassRate', () => {
  it('returns 100 for all-pass', () => {
    expect(computePassRate(100, 100)).toBe(100)
  })

  it('returns 0 for zero total', () => {
    expect(computePassRate(0, 0)).toBe(0)
  })

  it('rounds to one decimal place', () => {
    expect(computePassRate(1, 3)).toBe(33.3)
  })

  it('returns 0 for all-fail', () => {
    expect(computePassRate(0, 50)).toBe(0)
  })
})
