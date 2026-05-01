import { AddressNotFoundError } from '@maxmind/geoip2-node'
import prisma from '../prisma'
import { getGeoClient } from './client'

export type GeoResult = {
  country: string | null
  city: string | null
  lat: number | null
  lon: number | null
}

/**
 * Look up geo information for an IP address.
 *
 * Resolution order:
 * 1. GeoLocation table (DB cache — both positive and AddressNotFoundError negatives are cached here)
 * 2. MaxMind WebServiceClient (set by app/server/plugins/geoip-bootstrap.ts)
 * 3. null  (creds unset, or transient network/auth/quota error — retry next ingestion)
 *
 * Caching contract:
 * - Cache hit: return shape from row (fields may be null for cached negatives).
 * - Web service success: upsert with returned fields, return shape.
 * - AddressNotFoundError: upsert all-null row, return null-shape (definitive negative).
 * - Other errors (network, auth, quota): do NOT upsert, return plain null so the
 *   caller can retry on the next ingestion run.
 */
export async function lookupIp(ip: string): Promise<GeoResult | null> {
  // 1. DB cache hit (positive or cached negative)
  const cached = await prisma.geoLocation.findUnique({ where: { ip } })
  if (cached) {
    return {
      country: cached.country,
      city: cached.city,
      lat: cached.latitude,
      lon: cached.longitude,
    }
  }

  // 2. Client not configured → don't cache, signal "couldn't ask"
  const client = getGeoClient()
  if (!client) return null

  // 3. Web service call
  let response
  try {
    response = await client.city(ip)
  }
  catch (err) {
    // Definitive: MaxMind has no record for this IP → cache the negative
    if (err instanceof AddressNotFoundError) {
      await prisma.geoLocation.upsert({
        where: { ip },
        create: { ip, country: null, city: null, latitude: null, longitude: null },
        update: { country: null, city: null, latitude: null, longitude: null, lookedUpAt: new Date() },
      })
      return { country: null, city: null, lat: null, lon: null }
    }
    // Transient (network, auth, quota): do NOT cache, log, return null so we retry next time
    console.warn(`[geoip] lookup failed for ${ip}: ${(err as Error).message}`)
    return null
  }

  const country = response.country?.isoCode ?? null
  const city = response.city?.names?.en ?? null
  const lat = response.location?.latitude ?? null
  const lon = response.location?.longitude ?? null

  await prisma.geoLocation.upsert({
    where: { ip },
    create: { ip, country, city, latitude: lat, longitude: lon },
    update: { country, city, latitude: lat, longitude: lon, lookedUpAt: new Date() },
  })

  return { country, city, lat, lon }
}
