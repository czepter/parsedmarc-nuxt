import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } from '../../../app/server/utils/rate-limit'

describe('checkRateLimit', () => {
  let store: Map<string, number[]>
  const IP = '1.2.3.4'

  beforeEach(() => {
    store = new Map()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to RATE_LIMIT_MAX attempts within the window', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const result = checkRateLimit(store, IP, Date.now())
      expect(result.blocked).toBe(false)
    }
  })

  it('blocks on the attempt after RATE_LIMIT_MAX', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimit(store, IP, Date.now())
    }
    const result = checkRateLimit(store, IP, Date.now())
    expect(result.blocked).toBe(true)
    if (result.blocked) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS / 1000)
    }
  })

  it('allows again after the window expires', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimit(store, IP, Date.now())
    }
    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1)
    const result = checkRateLimit(store, IP, Date.now())
    expect(result.blocked).toBe(false)
  })

  it('does not block a different IP', () => {
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) {
      checkRateLimit(store, IP, Date.now())
    }
    const result = checkRateLimit(store, '5.6.7.8', Date.now())
    expect(result.blocked).toBe(false)
  })
})
