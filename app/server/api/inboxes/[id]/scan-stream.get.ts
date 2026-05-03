import prisma from '~~/lib/prisma'
import { decrypt } from '../../../utils/encryption'
import { runIngest } from '../../../utils/ingest'

/**
 * GET /api/inboxes/:id/scan-stream
 *
 * Server-Sent Events endpoint that triggers a manual scan and streams structured
 * log entries to the client as they are emitted by runIngest(). Each SSE message
 * carries a JSON payload:
 *
 *   { type: 'log', level: 'info'|'warn'|'error'|'success', message: string, ts: string }
 *   { type: 'done', messagesSeen: number, reportsParsed: number, errorMessage: string|null }
 *   { type: 'error', message: string }   ← only on fatal setup errors
 *
 * The browser-side EventSource automatically reconnects on network failures; the
 * server does NOT persist any state between reconnects — each connection triggers
 * a fresh scan.
 */
export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event)

  // ── Resolve inbox ────────────────────────────────────────────────────────────
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

  // ── SSE response setup ───────────────────────────────────────────────────────
  // Writing directly to the Node.js response is the most reliable SSE pattern
  // in H3: flushHeaders() sends the 200 + headers immediately, then each write()
  // delivers a chunk without buffering. H3 skips its own response handling once
  // res.headersSent is true.
  const res = event.node.res
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // prevent nginx buffering
  res.flushHeaders()

  const send = (data: object) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }
  }

  // ── Run scan ────────────────────────────────────────────────────────────────
  const result = await runIngest(inbox, decryptedPassword, entry =>
    send({ type: 'log', ...entry }),
  )

  send({ type: 'done', ...result })
  res.end()
})
