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
  errorMessage: string | null
}

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

/**
 * Run a full IMAP ingestion cycle for one inbox.
 *
 * @param inbox             Full Inbox row from the DB (includes all fields except password).
 * @param decryptedPassword The plaintext IMAP password. The caller decrypts this from
 *                          inbox.passwordEncrypted using useRuntimeConfig().sessionPassword.
 */
export async function runIngest(inbox: InboxRow, decryptedPassword: string): Promise<ScanResult> {
  let messagesSeen = 0
  let reportsParsed = 0
  const errorParts: string[] = []

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
    await client.connect()

    const unseenUids = await client.getUnseenUids('INBOX')
    if (unseenUids.length === 0) {
      return finalise(run.id, 0, 0, null)
    }

    const fetched = await client.fetchByUids(unseenUids, 'INBOX')
    messagesSeen = fetched.length

    for (const msg of fetched) {
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
            errorParts.push(`[uid:${msg.uid}] aggregate classified but no attachment found`)
            continue
          }

          let report
          try {
            report = parseAggregate(att)
          }
          catch (parseErr) {
            errorParts.push(`[uid:${msg.uid}] aggregate parse error: ${(parseErr as Error).message}`)
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
            const rawXml = (att.content as Buffer).toString('utf-8').slice(0, 1_000_000) // 1 MB cap
            const created = await prisma.aggregateReport.create({
              data: {
                reportId: report.reportId,
                orgName: report.orgName,
                domainId: domain.id,
                dateBegin: report.dateBegin,
                dateEnd: report.dateEnd,
                inboxId: inbox.id,
                rawXml,
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
                },
              })

              // GeoIP enrichment — non-fatal if MMDB is unavailable.
              // lookupIp upserts the GeoLocation row internally; we then fetch the row ID.
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

            reportsParsed++
          }
          // else: duplicate report — already in DB, skip silently

          // Mark message as processed
          await postProcess(client, [msg.uid], inbox.processedFolder ?? null)
        }
        else if (classification === 'forensic') {
          let forensicReport
          try {
            forensicReport = parseForensic(parsed)
          }
          catch (parseErr) {
            errorParts.push(`[uid:${msg.uid}] forensic parse error: ${(parseErr as Error).message}`)
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

          reportsParsed++
          await postProcess(client, [msg.uid], inbox.processedFolder ?? null)
        }
        else {
          // Unknown — log and leave unseen so it can be inspected
          errorParts.push(`[uid:${msg.uid}] unrecognized message type — left unseen`)
        }
      }
      catch (msgErr) {
        // Catch-all for unexpected per-message errors (NFR-R1)
        errorParts.push(`[uid:${msg.uid}] unexpected error: ${(msgErr as Error).message}`)
      }
    }
  }
  catch (topErr) {
    // Connection-level error (auth failure, network, etc.)
    errorParts.push(`connection error: ${(topErr as Error).message}`)
  }
  finally {
    await client.disconnect()
  }

  return finalise(
    run.id,
    messagesSeen,
    reportsParsed,
    errorParts.length > 0 ? errorParts.join('\n') : null,
  )
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
  errorMessage: string | null,
): Promise<ScanResult> {
  await prisma.scanRun.update({
    where: { id: runId },
    data: { finishedAt: new Date(), messagesSeen, reportsParsed, errorMessage },
  })
  return { messagesSeen, reportsParsed, errorMessage }
}
