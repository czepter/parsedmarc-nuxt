import { z } from 'zod'
import { ImapFlow } from 'imapflow'
import prisma from '~~/lib/prisma'
import { decrypt } from '../../../utils/encryption'
import { imapErrorMessage } from '../../../utils/imap-error'

// All fields are optional — any provided value overrides the stored row's value.
// This lets the edit form test unsaved changes to host/port/tls/username while
// still using the encrypted password already on file (blank password = keep current).
const testSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  tls: z.boolean().optional(),
  username: z.string().min(1).optional(),
})

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event)
  const body = await readValidatedBody(event, (raw) => testSchema.parse(raw))

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

  const client = new ImapFlow({
    host: body.host ?? inbox.host,
    port: body.port ?? inbox.port,
    secure: body.tls ?? inbox.tls,
    auth: { user: body.username ?? inbox.username, pass: decryptedPassword, loginMethod: 'LOGIN' },
    logger: false,
  })
  try {
    await client.connect()
    await client.logout()
  }
  catch (err) {
    throw createError({
      statusCode: 422,
      statusMessage: `Connection test failed: ${imapErrorMessage(err)}`,
    })
  }

  return { ok: true }
})
