import type { WebServiceClient } from '@maxmind/geoip2-node'

/**
 * Module-scoped singleton holding the MaxMind WebServiceClient.
 * Set once at startup by app/server/plugins/geoip-bootstrap.ts after
 * verifying that both NUXT_MAXMIND_ACCOUNT_ID and NUXT_MAXMIND_LICENSE_KEY
 * are configured. lib/geoip/lookup.ts reads it on each cache miss.
 *
 * Returns null until set, or if credentials are missing — callers must
 * handle the null case (lookupIp returns null without caching, so the
 * lookup is retried on the next ingestion run).
 */
let client: WebServiceClient | null = null

export function setGeoClient(c: WebServiceClient | null): void {
  client = c
}

export function getGeoClient(): WebServiceClient | null {
  return client
}
