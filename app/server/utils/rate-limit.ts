export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
export const RATE_LIMIT_MAX = 5

/** Singleton store — persists for the lifetime of the server process. */
export const loginAttempts = new Map<string, number[]>()

/**
 * Pure rate-limit check. Call with Date.now() as `now`.
 * Returns { blocked: false } if the attempt is allowed (and records it).
 * Returns { blocked: true, retryAfterSeconds } if the limit is exceeded.
 * Does NOT throw — the caller (middleware) is responsible for throwing.
 */
export function checkRateLimit(
  store: Map<string, number[]>,
  ip: string,
  now: number,
): { blocked: false } | { blocked: true; retryAfterSeconds: number } {
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recent = (store.get(ip) ?? []).filter(t => t > windowStart)

  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = Math.min(...recent)
    const retryAfterMs = oldest + RATE_LIMIT_WINDOW_MS - now
    return { blocked: true, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
  }

  recent.push(now)
  store.set(ip, recent)
  return { blocked: false }
}
