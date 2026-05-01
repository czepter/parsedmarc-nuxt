import { join } from 'node:path'
import { open } from 'maxmind'
import { downloadMmdb } from '~~/lib/geoip/download'
import { setGeoReader } from '~~/lib/geoip/reader'

const MMDB_PATH = join(process.cwd(), 'data', 'GeoLite2-City.mmdb')

export default defineEventHandler(async (): Promise<{ ok: true }> => {
  const { maxmindLicenseKey } = useRuntimeConfig()

  if (!maxmindLicenseKey) {
    throw createError({
      statusCode: 422,
      statusMessage: 'NUXT_MAXMIND_LICENSE_KEY is not configured — cannot refresh GeoIP database',
    })
  }

  try {
    await downloadMmdb(maxmindLicenseKey, MMDB_PATH)
  }
  catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `MaxMind download failed: ${(err as Error).message}`,
    })
  }

  try {
    const reader = await open(MMDB_PATH)
    setGeoReader(reader)
  }
  catch (err) {
    console.error('[geoip] Failed to reload reader after refresh:', (err as Error).message)
  }

  return { ok: true }
})
