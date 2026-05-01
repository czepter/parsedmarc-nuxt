import { Cron } from 'croner'
import { join } from 'node:path'
import { open } from 'maxmind'
import { downloadMmdb } from '~~/lib/geoip/download'
import { setGeoReader } from '~~/lib/geoip/reader'

const MMDB_PATH = join(process.cwd(), 'data', 'GeoLite2-City.mmdb')

export default defineNitroPlugin(() => {
  // Smoke-test job: runs once at the next minute mark to confirm croner initializes
  new Cron('* * * * *', { maxRuns: 1 }, () => {
    console.info('[scheduler] cron smoke test: OK')
  })

  // Monthly MMDB refresh — 04:00 on the 1st of each month
  new Cron('0 4 1 * *', async () => {
    const licenseKey = useRuntimeConfig().maxmindLicenseKey
    if (!licenseKey) {
      console.warn('[scheduler] MMDB refresh skipped — NUXT_MAXMIND_LICENSE_KEY not set')
      return
    }
    console.info('[scheduler] Starting monthly MMDB refresh…')
    try {
      await downloadMmdb(licenseKey, MMDB_PATH)
      const reader = await open(MMDB_PATH)
      setGeoReader(reader)
      console.info('[scheduler] MMDB refresh complete')
    }
    catch (err) {
      console.error('[scheduler] MMDB refresh failed:', (err as Error).message)
    }
  })

  console.info('[scheduler] Jobs registered')
})
