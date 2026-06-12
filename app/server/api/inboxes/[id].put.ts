import { z } from 'zod'
import { ImapFlow } from 'imapflow'
import prisma from '~~/lib/prisma'
import { encrypt } from '../../utils/encryption'
import { imapErrorMessage } from '../../utils/imap-error'

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  tls: z.boolean().optional(),
  username: z.string().min(1).optional(),
  password: z.string().optional(), // empty string treated as "unchanged"
  processedFolder: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  pollCron: z.string().optional(),
})

const INBOX_SELECT = {
  id: true, label: true, host: true, port: true, tls: true,
  username: true, processedFolder: true, enabled: true, pollCron: true,
} as const

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event)
  const body = await readValidatedBody(event, (raw) => updateSchema.parse(raw))

  const existing = await prisma.inbox.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Inbox not found' })

  const { password, ...rest } = body

  // Test connection only when a new password is provided
  if (password) {
    const client = new ImapFlow({
      host: rest.host ?? existing.host,
      port: rest.port ?? existing.port,
      secure: rest.tls ?? existing.tls,
      auth: { user: rest.username ?? existing.username, pass: password, loginMethod: 'LOGIN' },
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
  }

  const updateData: Record<string, unknown> = { ...rest }
  if (password) {
    const { sessionPassword } = useRuntimeConfig()
    updateData.passwordEncrypted = encrypt(password, sessionPassword)
  }

  return prisma.inbox.update({
    where: { id },
    data: updateData,
    select: INBOX_SELECT,
  })
})
