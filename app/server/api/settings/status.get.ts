import prisma from '~~/lib/prisma'
import { getGeoClient } from '~~/lib/geoip/client'

interface SettingsStatusResponse {
  geoip: {
    clientActive: boolean
  }
  user: { email: string }
  licenseKeyConfigured: boolean
}

export default defineEventHandler(async (event): Promise<SettingsStatusResponse> => {
  const session = await getUserSession(event)
  const user = await prisma.user.findUnique({
    where: { id: session.userId as number },
    select: { email: true },
  })

  const { maxmindAccountId, maxmindLicenseKey } = useRuntimeConfig()

  return {
    geoip: {
      clientActive: getGeoClient() !== null,
    },
    user: { email: user?.email ?? '' },
    licenseKeyConfigured: !!(maxmindAccountId && maxmindLicenseKey),
  }
})
