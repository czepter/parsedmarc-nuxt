import { z } from 'zod'
import { ImapFlow } from 'imapflow'
import prisma from '~~/lib/prisma'
import { encrypt } from '../../utils/encryption'
import { imapErrorMessage } from '../../utils/imap-error'

const createSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  host: z.string().min(1, 'Host is required'),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  tls: z.boolean().default(true),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  processedFolder: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  pollCron: z.string().default('*/15 * * * *'),
})

const INBOX_SELECT = {
  id: true, label: true, host: true, port: true, tls: true,
  username: true, processedFolder: true, enabled: true, pollCron: true,
} as const

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (raw) => createSchema.parse(raw))
  const { password, ...rest } = body

  // Test the IMAP connection before persisting — surface a useful error to the UI
  const client = new ImapFlow({
    host: rest.host,
    port: rest.port,
    secure: rest.tls,
    auth: { user: rest.username, pass: password, loginMethod: 'LOGIN' },
    logger: false,
  })
  try {
    await client.connect()
    await client.logout()
  }
  catch (err) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Connection test failed',
      message: `Connection test failed: ${imapErrorMessage(err)}`,
    })
  }

  const { sessionPassword } = useRuntimeConfig()
  const passwordEncrypted = encrypt(password, sessionPassword)

  return prisma.inbox.create({
    data: { ...rest, passwordEncrypted },
    select: INBOX_SELECT,
  })
})
