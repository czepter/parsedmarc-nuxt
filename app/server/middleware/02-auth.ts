// H3 functions (defineEventHandler, getRequestURL, sendRedirect, createError)
// and nuxt-auth-utils (getUserSession) are auto-imported by Nuxt — no imports needed.

const BYPASS_PREFIXES = [
  '/setup',
  '/login',
  '/api/auth/',
  '/api/health',
  '/api/test/',
  '/_nuxt/',
  '/__nuxt_error',
  '/favicon.ico',
  '/robots.txt',
]

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (BYPASS_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return
  }

  const session = await getUserSession(event)

  if (!session.userId) {
    if (path.startsWith('/api/')) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    return sendRedirect(event, '/login', 302)
  }
})
