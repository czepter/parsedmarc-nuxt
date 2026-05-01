import { describe, it, expect } from 'vitest'

const PAGE_SIZE = 50

function computePagination(total: number, page: number) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const skip = (page - 1) * PAGE_SIZE
  return { totalPages, skip, take: PAGE_SIZE }
}

function parseDispositions(param: string | undefined): string[] {
  const valid = ['none', 'quarantine', 'reject']
  if (!param) return []
  return param.split(',').filter(d => valid.includes(d))
}

describe('computePagination', () => {
  it('page 1 skip = 0', () => {
    expect(computePagination(200, 1).skip).toBe(0)
  })

  it('page 2 skip = 50', () => {
    expect(computePagination(200, 2).skip).toBe(50)
  })

  it('totalPages rounds up', () => {
    expect(computePagination(101, 1).totalPages).toBe(3)
  })

  it('exact multiple — no extra page', () => {
    expect(computePagination(100, 1).totalPages).toBe(2)
  })

  it('0 records → 0 pages', () => {
    expect(computePagination(0, 1).totalPages).toBe(0)
  })
})

describe('parseDispositions', () => {
  it('returns empty array for undefined param', () => {
    expect(parseDispositions(undefined)).toEqual([])
  })

  it('parses a single valid disposition', () => {
    expect(parseDispositions('none')).toEqual(['none'])
  })

  it('parses multiple valid dispositions', () => {
    expect(parseDispositions('none,reject')).toEqual(['none', 'reject'])
  })

  it('filters out invalid values', () => {
    expect(parseDispositions('none,bogus,reject')).toEqual(['none', 'reject'])
  })

  it('empty string returns empty array', () => {
    expect(parseDispositions('')).toEqual([])
  })
})
