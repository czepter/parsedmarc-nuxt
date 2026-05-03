import { getEmailAuth } from '../../../utils/dns-lookup'

/**
 * POST /api/dns-lookup/:domain/refresh
 * Force-refreshes all four record types for a domain (bypasses TTL cache).
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

  return await getEmailAuth(decoded, { force: true })
})
