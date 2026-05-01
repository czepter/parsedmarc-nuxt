import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { open } from 'maxmind'
import { downloadMmdb } from '~~/lib/geoip/download'
import { setGeoReader } from '~~/lib/geoip/reader'

const MMDB_PATH = join(process.cwd(), 'data', 'GeoLite2-City.mmdb')
const MAX_AGE_MS = 35 * 24 * 60 * 60 * 1000 // 35 days

function needsDownload(): boolean {
  if (!existsSync(MMDB_PATH)) return true
  const { mtime } = statSync(MMDB_PATH)
  return Date.now() - mtime.getTime() > MAX_AGE_MS
}

export default defineNitroPlugin(async () => {
  const licenseKey = useRuntimeConfig().maxmindLicenseKey

  if (!licenseKey) {
    console.warn('[geoip] NUXT_MAXMIND_LICENSE_KEY not set — GeoIP lookups will return null')
    return
  }

  if (needsDownload()) {
    console.info('[geoip] Downloading GeoLite2-City.mmdb from MaxMind…')
    try {
      await downloadMmdb(licenseKey, MMDB_PATH)
      console.info('[geoip] Download complete')
    }
    catch (err) {
      console.error('[geoip] Download failed (GeoIP will be unavailable until next restart):', (err as Error).message)
      return
    }
  }

  try {
    const reader = await open(MMDB_PATH)
    setGeoReader(reader)
    console.info('[geoip] Reader initialized')
  }
  catch (err) {
    console.error('[geoip] Failed to open MMDB (GeoIP will be unavailable):', (err as Error).message)
  }
})
