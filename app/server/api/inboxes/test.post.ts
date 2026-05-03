import { z } from 'zod'
import { ImapFlow } from 'imapflow'
import { imapErrorMessage } from '../../utils/imap-error'

const testSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  tls: z.boolean().default(true),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (raw) => testSchema.parse(raw))

  // Capture the raw IMAP exchange so we can return it with the error for debugging.
  // ImapFlow marks sensitive values (passwords) as "(* value hidden *)" automatically.
  const logs: string[] = []
  const captureLogger = {
    debug: (obj: Record<string, unknown>) => {
      const src = obj.src ? `[${obj.src}] ` : ''
      const msg = obj.msg ?? obj.comment ?? JSON.stringify(obj)
      logs.push(`${src}${msg}`)
    },
    info: (obj: Record<string, unknown>) => logs.push(`[info] ${obj.msg ?? JSON.stringify(obj)}`),
    warn: (obj: Record<string, unknown>) => logs.push(`[warn] ${obj.msg ?? JSON.stringify(obj)}`),
    error: (obj: Record<string, unknown>) => logs.push(`[error] ${obj.msg ?? JSON.stringify(obj)}`),
  }

  const client = new ImapFlow({
    host: body.host,
    port: body.port,
    secure: body.tls,
    auth: { user: body.username, pass: body.password, loginMethod: 'LOGIN' },
    logger: captureLogger,
  })
  try {
    await client.connect()
    await client.logout()
  }
  catch (err) {
    throw createError({
      statusCode: 422,
      statusMessage: `Connection test failed: ${imapErrorMessage(err)}\n\nIMAP log:\n${logs.join('\n')}`,
    })
  }

  return { ok: true }
})
