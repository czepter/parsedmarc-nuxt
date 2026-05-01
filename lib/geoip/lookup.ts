import type { CityResponse } from 'maxmind'
import prisma from '../prisma'
import { getGeoReader } from './reader'

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
 * 1. GeoLocation table (DB cache — avoids hitting the MMDB on every call)
 * 2. maxmind Reader (in-memory, set by the geoip-bootstrap plugin)
 * 3. null  (MMDB not yet downloaded, or IP not in the database)
 */
export async function lookupIp(ip: string): Promise<GeoResult | null> {
  // 1. DB cache hit
  const cached = await prisma.geoLocation.findUnique({ where: { ip } })
  if (cached) {
    return {
      country: cached.country,
      city: cached.city,
      lat: cached.latitude,
      lon: cached.longitude,
    }
  }

  // 2. Reader not loaded
  const reader = getGeoReader()
  if (!reader) return null

  // 3. Reader lookup
  const record = reader.get(ip) as CityResponse | undefined
  if (!record) return null

  const country = record.country?.iso_code ?? null
  const city = record.city?.names?.en ?? null
  const lat = record.location?.latitude ?? null
  const lon = record.location?.longitude ?? null

  // 4. Persist for future cache hits
  await prisma.geoLocation.upsert({
    where: { ip },
    create: { ip, country, city, latitude: lat, longitude: lon },
    update: { country, city, latitude: lat, longitude: lon, lookedUpAt: new Date() },
  })

  return { country, city, lat, lon }
}
