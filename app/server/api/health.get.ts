import prisma from '~~/lib/prisma'
import { getGeoClient } from '~~/lib/geoip/client'

export default defineEventHandler(async () => {
  let db = false
  try {
    await prisma.$queryRaw`SELECT 1`
    db = true
  }
  catch {}

  // GeoIP is healthy when the WebServiceClient singleton has been initialized
  // (i.e. NUXT_MAXMIND_ACCOUNT_ID and NUXT_MAXMIND_LICENSE_KEY are configured).
  // We deliberately do NOT call client.city() here — we don't want a health probe
  // burning quota or coupling our liveness signal to MaxMind's uptime.
  const geoip = getGeoClient() !== null

  return { status: 'ok' as const, db, geoip }
})
