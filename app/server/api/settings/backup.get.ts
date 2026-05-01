import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFile, unlink } from 'node:fs/promises'
import prisma from '~~/lib/prisma'

export default defineEventHandler(async (event): Promise<Buffer> => {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const filename = `parsedmarc-${date}.db`
  const tmpPath = join(tmpdir(), filename)

  try {
    // VACUUM INTO creates a defragmented copy of the live database.
    // The path is fully server-controlled — not user input — so $executeRawUnsafe is safe.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${tmpPath}'`)
  }
  catch (err) {
    throw createError({
      statusCode: 500,
      statusMessage: `Backup failed: ${(err as Error).message}`,
    })
  }

  let data: Buffer
  try {
    data = await readFile(tmpPath)
  }
  finally {
    await unlink(tmpPath).catch(() => {})
  }

  setHeader(event, 'Content-Type', 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)

  return data
})
