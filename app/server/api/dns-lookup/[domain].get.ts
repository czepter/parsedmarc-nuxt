import { getEmailAuth } from '../../utils/dns-lookup'

/**
 * GET /api/dns-lookup/:domain
 * Cache-first read of all four record types for a domain. Stale rows
 * (older than 1h) are refreshed transparently.
 */
export default defineEventHandler(async (event) => {
  const { domain } = getRouterParams(event)
  if (!domain) {
    throw createError({ statusCode: 400, statusMessage: 'Missing domain' })
  }
  const decoded = decodeURIComponent(domain).toLowerCase().trim()

  if (!decoded || !/^[a-z0-9.-]+$/.test(decoded)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid domain' })
  }

  return await getEmailAuth(decoded)
})
