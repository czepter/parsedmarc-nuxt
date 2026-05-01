import { Cron } from 'croner'
import prisma from '~~/lib/prisma'
import { decrypt } from '../utils/encryption'
import { runIngest } from '../utils/ingest'

/**
 * Check if a cron expression would have fired within the last 60 seconds.
 * Used by the per-inbox dispatcher to decide whether to run a given inbox's poll.
 */
function isDue(expression: string, now: Date): boolean {
  try {
    const cron = new Cron(expression, { timezone: 'UTC' })
    const prev = cron.nextRun(new Date(now.getTime() - 61_000))
    return (
      prev !== null
      && prev.getTime() >= now.getTime() - 60_000
      && prev.getTime() <= now.getTime()
    )
  }
  catch {
    return false
  }
}

export default defineNitroPlugin(() => {
  // --- Smoke test (runs once at startup) ---
  new Cron('* * * * *', { maxRuns: 1 }, () => {
    console.info('[scheduler] cron smoke test: OK')
  })

  // --- Per-inbox DMARC ingestion dispatcher ---
  // Runs every minute. Re-queries the DB so inboxes added after server start are picked up.
  new Cron('* * * * *', async () => {
    const { sessionPassword } = useRuntimeConfig()
    const now = new Date()

    let inboxes: Awaited<ReturnType<typeof prisma.inbox.findMany>>
    try {
      inboxes = await prisma.inbox.findMany({ where: { enabled: true } })
    }
    catch (dbErr) {
      console.error('[scheduler] Failed to query inboxes:', (dbErr as Error).message)
      return
    }

    for (const inbox of inboxes) {
      if (!isDue(inbox.pollCron, now)) continue

      // NFR-R2: one bad inbox must not block others
      try {
        const decryptedPassword = decrypt(inbox.passwordEncrypted, sessionPassword)
        console.info(`[scheduler] Starting ingest for inbox "${inbox.label}" (${inbox.id})`)
        const result = await runIngest(inbox, decryptedPassword)
        console.info(
          `[scheduler] Ingest complete for "${inbox.label}": `
          + `${result.messagesSeen} seen, ${result.reportsParsed} parsed`
          + (result.errorMessage ? `, errors: ${result.errorMessage.split('\n').length}` : ''),
        )
      }
      catch (inboxErr) {
        console.error(
          `[scheduler] Ingest failed for inbox "${inbox.label}":`,
          (inboxErr as Error).message,
        )
      }
    }
  })

  console.info('[scheduler] Jobs registered')
})
