import { existsSync } from 'node:fs'
import { join } from 'node:path'
import prisma from '~~/lib/prisma'

export default defineEventHandler(async () => {
  let db = false
  try {
    await prisma.$queryRaw`SELECT 1`
    db = true
  }
  catch {}

  const mmdb = existsSync(join(process.cwd(), 'data', 'GeoLite2-City.mmdb'))

  return { status: 'ok' as const, db, mmdb }
})
