// H3 functions (defineEventHandler, getMethod, getRequestURL, getRequestIP,
// createError, setResponseHeader) are auto-imported by Nuxt — no import needed.
import { checkRateLimit, loginAttempts } from '../utils/rate-limit'

export default defineEventHandler((event) => {
  if (
    getMethod(event) !== 'POST' ||
    getRequestURL(event).pathname !== '/api/auth/login'
  ) {
    return
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? '127.0.0.1'
  const result = checkRateLimit(loginAttempts, ip, Date.now())

  if (result.blocked) {
    setResponseHeader(event, 'Retry-After', String(result.retryAfterSeconds))
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Too many attempts. Try again in ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`,
    })
  }
})
