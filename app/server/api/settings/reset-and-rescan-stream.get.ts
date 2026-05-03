import prisma from '~~/lib/prisma'
import { decrypt } from '../../utils/encryption'
import { runIngest } from '../../utils/ingest'

/**
 * GET /api/settings/reset-and-rescan-stream
 *
 * Server-Sent Events endpoint that:
 *   1. Wipes all DMARC report data from the database (preserving inbox configs, users, sessions).
 *   2. Re-ingests ALL messages (seen + unseen) from every enabled inbox.
 *
 * SSE event payloads:
 *   { type: 'reset-done' }
 *   { type: 'inbox-start',  label: string, index: number, total: number }
 *   { type: 'log',          level: 'info'|'warn'|'error'|'success', message: string, ts: string }
 *   { type: 'inbox-done',   messagesSeen: number, reportsParsed: number, errorMessage: string|null }
 *   { type: 'done',         totalMessages: number, totalReports: number }
 *   { type: 'error',        message: string }  ← fatal setup errors only
 */
export default defineEventHandler(async (event) => {
  const { sessionPassword } = useRuntimeConfig()

  // ── SSE response setup ────────────────────────────────────────────────────
  const res = event.node.res
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (data: object) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }
  }

  // ── Phase 1: Reset DMARC data ─────────────────────────────────────────────
  // Deletion order respects FK constraints:
  //   AggregateReport (CASCADE → AggregateRecord) must be gone before Domain (RESTRICT).
  //   ForensicReport also references Domain (RESTRICT), so it goes first too.
  //   GeoLocation has no remaining dependants once AggregateRecord rows are gone.
  try {
    await prisma.aggregateReport.deleteMany()  // cascades AggregateRecord rows
    await prisma.forensicReport.deleteMany()
    await prisma.scanRun.deleteMany()
    await prisma.geoLocation.deleteMany()
    await prisma.domain.deleteMany()
  }
  catch (err) {
    send({ type: 'error', message: `Database reset failed: ${(err as Error).message}` })
    res.end()
    return
  }

  send({ type: 'reset-done' })

  // ── Phase 2: Re-ingest all enabled inboxes ────────────────────────────────
  const inboxes = await prisma.inbox.findMany({ where: { enabled: true } })
  const total = inboxes.length

  if (total === 0) {
    send({ type: 'done', totalMessages: 0, totalReports: 0 })
    res.end()
    return
  }

  let totalMessages = 0
  let totalReports = 0
  let totalDuplicates = 0

  for (let i = 0; i < inboxes.length; i++) {
    const inbox = inboxes[i]!
    send({ type: 'inbox-start', label: inbox.label, index: i, total })

    let decryptedPassword: string
    try {
      decryptedPassword = decrypt(inbox.passwordEncrypted, sessionPassword)
    }
    catch {
      send({
        type: 'log',
        level: 'error',
        message: `Failed to decrypt credentials for "${inbox.label}" — skipping`,
        ts: new Date().toISOString(),
      })
      send({ type: 'inbox-done', messagesSeen: 0, reportsParsed: 0, errorMessage: 'Credential decryption failed' })
      continue
    }

    const result = await runIngest(
      inbox,
      decryptedPassword,
      entry => send({ type: 'log', ...entry }),
      { reimportAll: true },
    )

    totalMessages += result.messagesSeen
    totalReports += result.reportsParsed
    totalDuplicates += result.duplicatesSkipped
    send({ type: 'inbox-done', ...result })
  }

  send({ type: 'done', totalMessages, totalReports, totalDuplicates })
  res.end()
})
