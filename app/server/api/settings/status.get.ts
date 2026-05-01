import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import prisma from '~~/lib/prisma'
import { getGeoReader } from '~~/lib/geoip/reader'

const MMDB_PATH = join(process.cwd(), 'data', 'GeoLite2-City.mmdb')

interface MmdbStatus {
  exists: boolean
  ageDays: number | null
  readerActive: boolean
}

interface SettingsStatusResponse {
  mmdb: MmdbStatus
  user: { email: string }
  licenseKeyConfigured: boolean
}

export default defineEventHandler(async (event): Promise<SettingsStatusResponse> => {
  const session = await getUserSession(event)
  const user = await prisma.user.findUnique({
    where: { id: session.userId as number },
    select: { email: true },
  })

  let mmdb: MmdbStatus = { exists: false, ageDays: null, readerActive: false }
  if (existsSync(MMDB_PATH)) {
    const { mtime } = statSync(MMDB_PATH)
    mmdb = {
      exists: true,
      ageDays: Math.floor((Date.now() - mtime.getTime()) / (24 * 60 * 60 * 1000)),
      readerActive: getGeoReader() !== null,
    }
  }

  const { maxmindLicenseKey } = useRuntimeConfig()

  return {
    mmdb,
    user: { email: user?.email ?? '' },
    licenseKeyConfigured: !!maxmindLicenseKey,
  }
})
