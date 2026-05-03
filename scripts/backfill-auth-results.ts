/**
 * Backfill auth_results and policy_published fields for existing AggregateReport rows.
 *
 * Safe to re-run: skips records where spfAuthResult is already set.
 * Skips reports where rawXml cannot be parsed (binary/corrupted from pre-fix ingestion).
 *
 * Run: pnpm exec tsx scripts/backfill-auth-results.ts
 */

import { XMLParser } from 'fast-xml-parser'
import prisma from '../lib/prisma'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name: string, jpath: string) =>
    name === 'record' ||
    (name === 'dkim' && jpath.includes('auth_results')),
})

async function main() {
  const reports = await prisma.aggregateReport.findMany({
    select: {
      id: true,
      rawXml: true,
      records: { select: { id: true, sourceIp: true, spfAuthResult: true } },
    },
  })

  let backfilled = 0
  let skipped = 0
  let alreadyDone = 0

  for (const report of reports) {
    // Skip if all records in this report already have auth data
    if (report.records.length > 0 && report.records.every(r => r.spfAuthResult !== null)) {
      alreadyDone++
      continue
    }

    let doc: ReturnType<typeof parser.parse>
    try {
      doc = parser.parse(report.rawXml)
    }
    catch {
      console.warn(`⚠  Report ${report.id}: rawXml could not be parsed (binary?) — skipping`)
      skipped++
      continue
    }

    const fb = doc?.feedback
    if (!fb?.policy_published) {
      console.warn(`⚠  Report ${report.id}: missing <feedback> or <policy_published> — skipping`)
      skipped++
      continue
    }

    const policy = fb.policy_published as Record<string, unknown>

    // Update report policy fields
    await prisma.aggregateReport.update({
      where: { id: report.id },
      data: {
        policyP: policy?.p != null ? String(policy.p) : null,
        policySp: policy?.sp != null ? String(policy.sp) : null,
        policyAdkim: policy?.adkim != null ? String(policy.adkim) : null,
        policyAspf: policy?.aspf != null ? String(policy.aspf) : null,
        policyPct: policy?.pct != null ? Number(policy.pct) : null,
      },
    })

    const rawRecords: unknown[] = Array.isArray(fb.record)
      ? fb.record
      : fb.record
        ? [fb.record]
        : []

    for (const rawRec of rawRecords) {
      const rec = rawRec as Record<string, unknown>
      const row = rec.row as Record<string, unknown>
      const authResults = rec.auth_results as Record<string, unknown> | undefined
      const sourceIp = String(row?.source_ip ?? '')

      const spfAuth = authResults?.spf as Record<string, unknown> | undefined
      const spfAuthDomain = spfAuth?.domain != null ? String(spfAuth.domain) : null
      const spfAuthResult = spfAuth?.result != null ? String(spfAuth.result) : null

      const dkimEntries = (authResults?.dkim as Array<Record<string, unknown>> | undefined) ?? []
      const bestDkim = dkimEntries.find(d => String(d.result) === 'pass') ?? dkimEntries[0] ?? null
      const dkimAuthDomain = bestDkim?.domain != null ? String(bestDkim.domain) : null
      const dkimAuthSelector = bestDkim?.selector != null ? String(bestDkim.selector) : null
      const dkimAuthResult = bestDkim?.result != null ? String(bestDkim.result) : null

      // Match by sourceIp within this report; update all matching records that lack auth data
      const matching = report.records.filter(
        r => r.sourceIp === sourceIp && r.spfAuthResult === null,
      )
      for (const match of matching) {
        await prisma.aggregateRecord.update({
          where: { id: match.id },
          data: { spfAuthDomain, spfAuthResult, dkimAuthDomain, dkimAuthSelector, dkimAuthResult },
        })
      }
    }

    backfilled++
  }

  console.log(
    `✓ ${backfilled} reports backfilled, ⚠ ${skipped} skipped (unparseable rawXml), ` +
    `✓ ${alreadyDone} already up to date`,
  )
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
