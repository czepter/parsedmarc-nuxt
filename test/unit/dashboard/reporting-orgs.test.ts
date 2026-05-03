import { describe, it, expect } from 'vitest'

/**
 * Mirror the share + grandTotal formula used in
 * app/server/api/dashboard/reporting-orgs.get.ts (and countries.get.ts /
 * source-ips.get.ts). The endpoint computes:
 *
 *   grandTotal = SUM(row.total)
 *   share      = round((row.total / grandTotal) * 1000) / 10  (1 decimal %)
 */
function computeOrgShares(rows: Array<{ orgName: string; total: number }>) {
  const grandTotal = rows.reduce((acc, r) => acc + r.total, 0)
  return rows.map(r => ({
    orgName: r.orgName,
    count: r.total,
    share: grandTotal > 0 ? Math.round((r.total / grandTotal) * 1000) / 10 : 0,
  }))
}

describe('reporting-orgs share computation', () => {
  it('computes shares that sum to ~100 across all rows', () => {
    const rows = [
      { orgName: 'google.com', total: 600 },
      { orgName: 'mail.ru', total: 300 },
      { orgName: 'outlook.com', total: 100 },
    ]
    const result = computeOrgShares(rows)
    const totalShare = result.reduce((acc, r) => acc + r.share, 0)
    expect(totalShare).toBeCloseTo(100, 1)
  })

  it('rounds share to 1 decimal place', () => {
    const rows = [
      { orgName: 'a', total: 1 },
      { orgName: 'b', total: 2 },
      { orgName: 'c', total: 3 },
    ]
    const result = computeOrgShares(rows)
    // 1/6 = 16.6666... → 16.7
    expect(result[0]!.share).toBe(16.7)
    // 2/6 = 33.3333... → 33.3
    expect(result[1]!.share).toBe(33.3)
    // 3/6 = 50.0
    expect(result[2]!.share).toBe(50)
  })

  it('returns 0 share when grandTotal is 0', () => {
    const rows = [{ orgName: 'google.com', total: 0 }]
    const result = computeOrgShares(rows)
    expect(result[0]!.share).toBe(0)
  })

  it('returns empty list when given no rows', () => {
    expect(computeOrgShares([])).toEqual([])
  })

  it('preserves orgName and count untouched', () => {
    const rows = [{ orgName: 'mail.ru', total: 42 }]
    const result = computeOrgShares(rows)
    expect(result[0]!.orgName).toBe('mail.ru')
    expect(result[0]!.count).toBe(42)
  })
})

describe('reporting-orgs time range validation', () => {
  function isValidRange(fromSeconds: number, toSeconds: number): boolean {
    return Number.isFinite(fromSeconds) && Number.isFinite(toSeconds) && fromSeconds < toSeconds
  }

  it('rejects when from >= to', () => {
    expect(isValidRange(1700000100, 1700000000)).toBe(false)
  })

  it('rejects when from === to', () => {
    expect(isValidRange(1700000000, 1700000000)).toBe(false)
  })

  it('accepts a normal range', () => {
    expect(isValidRange(1700000000, 1700604800)).toBe(true)
  })

  it('rejects NaN bounds', () => {
    expect(isValidRange(NaN, 1700000000)).toBe(false)
  })
})
