import prisma from '~~/lib/prisma'
import { decrypt } from '../../../utils/encryption'
import { runIngest } from '../../../utils/ingest'

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event)
  const inbox = await prisma.inbox.findUnique({ where: { id } })
  if (!inbox) throw createError({ statusCode: 404, statusMessage: 'Inbox not found' })

  const { sessionPassword } = useRuntimeConfig()

  let decryptedPassword: string
  try {
    decryptedPassword = decrypt(inbox.passwordEncrypted, sessionPassword)
  }
  catch {
    throw createError({ statusCode: 500, statusMessage: 'Failed to decrypt inbox credentials' })
  }

  // runIngest always resolves (never rejects) — errors are captured in ScanResult.errorMessage
  await runIngest(inbox, decryptedPassword)

  // Return the most recent ScanRun row for this inbox (runIngest created and updated it)
  const run = await prisma.scanRun.findFirst({
    where: { inboxId: id },
    orderBy: { startedAt: 'desc' },
  })

  return run
})
