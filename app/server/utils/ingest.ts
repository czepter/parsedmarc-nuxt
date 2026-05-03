import { simpleParser } from 'mailparser'
import prisma from '../../../lib/prisma'
import { ImapClient } from '../../../lib/imap/client'
import { classifyMail } from '../../../lib/imap/dispatcher'
import { parseAggregate } from '../../../lib/dmarc/aggregate'
import { parseForensic } from '../../../lib/dmarc/forensic'
import { lookupIp } from '../../../lib/geoip/lookup'

export interface ScanResult {
  messagesSeen: number
  reportsParsed: number
  duplicatesSkipped: number
  errorMessage: string | null
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success'

export interface LogEntry {
  level: LogLevel
  message: string
  ts: string
}

/** Optional callback invoked with structured log entries as the scan progresses. */
export type LogFn = (entry: LogEntry) => void

type InboxRow = {
  id: string
  host: string
  port: number
  tls: boolean
  username: string
  passwordEncrypted: string
  processedFolder: string | null
  pollCron: string
  enabled: boolean
  label: string
}

export interface IngestOptions {
  /**
   * When true, fetch ALL messages in the mailbox (seen + unseen) instead of
   * only unseen ones. Post-processing (mark-seen / move-to-folder) is skipped
   * because those IMAP-side effects have already been applied; only the local
   * database is being repopulated after a reset.
   */
  reimportAll?: boolean
}

/**
 * Run a full IMAP ingestion cycle for one inbox.
 *
 * @param inbox             Full Inbox row from the DB (includes all fields except password).
 * @param decryptedPassword The plaintext IMAP password. The caller decrypts this from
 *                          inbox.passwordEncrypted using useRuntimeConfig().sessionPassword.
 * @param onLog             Optional callback invoked with structured log entries in real time.
 * @param options           Optional flags controlling ingestion behaviour.
 */
export async function runIngest(
  inbox: InboxRow,
  decryptedPassword: string,
  onLog?: LogFn,
  options?: IngestOptions,
): Promise<ScanResult> {
  let messagesSeen = 0
  let reportsParsed = 0
  let duplicatesSkipped = 0
  const errorParts: string[] = []

  const log = (level: LogLevel, message: string) =>
    onLog?.({ level, message, ts: new Date().toISOString() })

  // Create the ScanRun row immediately so it exists even if we crash during IMAP
  const run = await prisma.scanRun.create({
    data: { inboxId: inbox.id },
  })

  const client = new ImapClient({
    host: inbox.host,
    port: inbox.port,
    secure: inbox.tls,
    user: inbox.username,
    pass: decryptedPassword,
  })

  try {
    log('info', `Connecting to ${inbox.host}:${inbox.port}${inbox.tls ? ' (TLS)' : ''}…`)
    await client.connect()
    log('success', `Authenticated as ${inbox.username}`)

    const reimportAll = options?.reimportAll ?? false

    if (reimportAll) {
      log('info', 'Re-import mode: fetching ALL messages in INBOX (seen and unseen)…')
    }
    else {
      log('info', 'Checking INBOX for unseen messages…')
    }

    const uids = reimportAll
      ? await client.getAllUids('INBOX')
      : await client.getUnseenUids('INBOX')

    if (uids.length === 0) {
      log('info', reimportAll ? 'INBOX is empty — nothing to import' : 'INBOX is empty — nothing to process')
      return finalise(run.id, 0, 0, 0, null)
    }

    log('info', `Found ${uids.length} message(s) — fetching…`)
    const fetched = await client.fetchByUids(uids, 'INBOX')
    messagesSeen = fetched.length

    for (let i = 0; i < fetched.length; i++) {
      const msg = fetched[i]!
      log('info', `Processing message ${i + 1}/${fetched.length} [uid ${msg.uid}]`)

      try {
        const parsed = await simpleParser(msg.source)
        const classification = classifyMail(parsed)

        if (classification === 'aggregate') {
          const attachments = parsed.attachments ?? []
          // Find the first attachment that looks like a DMARC aggregate report
          const AGGREGATE_EXTS = ['.xml', '.xml.gz', '.xml.zip', '.zip', '.gz']
          const att
            = attachments.find(a =>
              AGGREGATE_EXTS.some(ext => (a.filename ?? '').toLowerCase().endsWith(ext)),
            ) ?? attachments[0]

          if (!att) {
            const msg2 = `[uid:${msg.uid}] aggregate classified but no attachment found`
            errorParts.push(msg2)
            log('error', msg2)
            continue
          }

          let report
          try {
            report = parseAggregate(att)
          }
          catch (parseErr) {
            const msg2 = `[uid:${msg.uid}] aggregate parse error: ${(parseErr as Error).message}`
            errorParts.push(msg2)
            log('error', msg2)
            // Do not mark seen — leave for manual inspection
            continue
          }

          // Upsert the domain
          const domain = await prisma.domain.upsert({
            where: { name: report.domain },
            create: { name: report.domain },
            update: {},
          })

          // Check if this report was already ingested (idempotency)
          const existing = await prisma.aggregateReport.findUnique({
            where: { reportId: report.reportId },
          })

          if (!existing) {
            // Use the already-decompressed XML string from the parser (fixes corrupt storage
            // for gzip/zip attachments that were previously stored as raw binary bytes).
            const rawXml = report.xmlString.slice(0, 1_000_000) // 1 MB cap
            const created = await prisma.aggregateReport.create({
              data: {
                reportId: report.reportId,
                orgName: report.orgName,
                domainId: domain.id,
                dateBegin: report.dateBegin,
                dateEnd: report.dateEnd,
                inboxId: inbox.id,
                rawXml,
                policyP: report.policyP,
                policySp: report.policySp,
                policyAdkim: report.policyAdkim,
                policyAspf: report.policyAspf,
                policyPct: report.policyPct,
              },
            })

            // Create AggregateRecord rows and enrich with GeoIP
            for (const rec of report.records) {
              const record = await prisma.aggregateRecord.create({
                data: {
                  reportId: created.id,
                  sourceIp: rec.sourceIp,
                  count: rec.count,
                  disposition: rec.disposition,
                  dkim: rec.dkim,
                  spf: rec.spf,
                  headerFrom: rec.headerFrom,
                  spfAuthDomain: rec.spfAuthDomain,
                  spfAuthResult: rec.spfAuthResult,
                  dkimAuthDomain: rec.dkimAuthDomain,
                  dkimAuthSelector: rec.dkimAuthSelector,
                  dkimAuthResult: rec.dkimAuthResult,
                },
              })

              // GeoIP enrichment — non-fatal if the WebServiceClient is unavailable
              // (e.g. credentials unset, network failure). lookupIp upserts the
              // GeoLocation row internally; we then fetch the row ID.
              try {
                const geo = await lookupIp(rec.sourceIp)
                if (geo) {
                  const geoRow = await prisma.geoLocation.findUnique({
                    where: { ip: rec.sourceIp },
                  })
                  if (geoRow) {
                    await prisma.aggregateRecord.update({
                      where: { id: record.id },
                      data: { geoLocationId: geoRow.id },
                    })
                  }
                }
              }
              catch {
                // GeoIP failure is non-fatal — record is created without geo data
              }
            }

            log('success', `Aggregate report saved — org: ${report.orgName}, domain: ${report.domain}`)
            reportsParsed++
          }
          else {
            log('info', `Aggregate report already stored (${report.reportId}) — skipped`)
            duplicatesSkipped++
          }

          // Mark message as processed (skip in re-import mode — already done on IMAP server)
          if (!reimportAll) {
            await postProcess(client, [msg.uid], inbox.processedFolder ?? null)
          }
        }
        else if (classification === 'forensic') {
          let forensicReport
          try {
            forensicReport = parseForensic(parsed)
          }
          catch (parseErr) {
            const msg2 = `[uid:${msg.uid}] forensic parse error: ${(parseErr as Error).message}`
            errorParts.push(msg2)
            log('error', msg2)
            continue
          }

          const domainName = forensicReport.domain || `unknown-${inbox.id}`
          const domain = await prisma.domain.upsert({
            where: { name: domainName },
            create: { name: domainName },
            update: {},
          })

          await prisma.forensicReport.create({
            data: {
              domainId: domain.id,
              arrivalDate: forensicReport.arrivalDate,
              sourceIp: forensicReport.sourceIp,
              subject: forensicReport.subject,
              rawEml: msg.source.toString('utf-8').slice(0, 2_000_000), // 2 MB cap
              inboxId: inbox.id,
            },
          })

          log('success', `Forensic report saved — domain: ${domainName}`)
          reportsParsed++
          // Skip in re-import mode — already done on IMAP server
          if (!reimportAll) {
            await postProcess(client, [msg.uid], inbox.processedFolder ?? null)
          }
        }
        else {
          // Unknown — log and leave unseen so it can be inspected
          const msg2 = `[uid:${msg.uid}] unrecognized message type — left unseen`
          errorParts.push(msg2)
          log('warn', msg2)
        }
      }
      catch (msgErr) {
        // Catch-all for unexpected per-message errors (NFR-R1)
        const msg2 = `[uid:${msg.uid}] unexpected error: ${(msgErr as Error).message}`
        errorParts.push(msg2)
        log('error', msg2)
      }
    }
  }
  catch (topErr) {
    // Connection-level error (auth failure, network, etc.)
    const msg2 = `Connection error: ${(topErr as Error).message}`
    errorParts.push(msg2)
    log('error', msg2)
  }
  finally {
    await client.disconnect()
  }

  const errorMessage = errorParts.length > 0 ? errorParts.join('\n') : null
  const dupSuffix = duplicatesSkipped > 0 ? `, ${duplicatesSkipped} duplicate(s) skipped` : ''
  if (errorMessage) {
    log('warn', `Scan finished with ${errorParts.length} error(s) — see above`)
  }
  else {
    log('success', `Scan complete — ${messagesSeen} message(s) seen, ${reportsParsed} report(s) parsed${dupSuffix}`)
  }

  return finalise(run.id, messagesSeen, reportsParsed, duplicatesSkipped, errorMessage)
}

/** Move or mark-seen a batch of UIDs depending on whether a processed folder is configured. */
async function postProcess(
  client: ImapClient,
  uids: number[],
  processedFolder: string | null,
): Promise<void> {
  if (processedFolder) {
    await client.moveToFolder(uids, processedFolder, 'INBOX')
  }
  else {
    await client.markSeen(uids, 'INBOX')
  }
}

/** Update the ScanRun row with final stats and return the ScanResult. */
async function finalise(
  runId: string,
  messagesSeen: number,
  reportsParsed: number,
  duplicatesSkipped: number,
  errorMessage: string | null,
): Promise<ScanResult> {
  await prisma.scanRun.update({
    where: { id: runId },
    data: { finishedAt: new Date(), messagesSeen, reportsParsed, errorMessage },
  })
  return { messagesSeen, reportsParsed, duplicatesSkipped, errorMessage }
}
