import { WebServiceClient } from '@maxmind/geoip2-node'
import { setGeoClient } from '~~/lib/geoip/client'

/**
 * GeoIP startup plugin.
 *
 * Constructs the MaxMind WebServiceClient singleton against the free
 * GeoLite2 web service host (`geolite.info`) using NUXT_MAXMIND_ACCOUNT_ID
 * + NUXT_MAXMIND_LICENSE_KEY. If either credential is missing, logs a
 * warning and skips initialization — lookupIp will then return null for
 * every cache miss, and ingestion proceeds without geo enrichment.
 */
export default defineNitroPlugin(() => {
  const { maxmindAccountId, maxmindLicenseKey } = useRuntimeConfig()

  if (!maxmindAccountId || !maxmindLicenseKey) {
    console.warn(
      '[geoip] NUXT_MAXMIND_ACCOUNT_ID and NUXT_MAXMIND_LICENSE_KEY required '
      + '— GeoIP lookups will return null',
    )
    return
  }

  setGeoClient(new WebServiceClient(maxmindAccountId, maxmindLicenseKey, { host: 'geolite.info' }))
  console.info('[geoip] WebServiceClient initialized (geolite.info)')
})
