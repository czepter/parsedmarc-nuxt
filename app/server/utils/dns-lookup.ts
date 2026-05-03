/**
 * DNS resolver + cache layer for email-authentication records.
 *
 * Exposes:
 *   - `getEmailAuth(domain, opts)` — returns the union of cached DMARC/SPF/
 *     DKIM/MX lookups for a domain, refreshing any rows older than `maxAgeMs`
 *     (default 1h) or if `force` is true.
 *   - `refreshAllEmailAuth()` — iterates every reported-for domain, force-
 *     refreshes each. Used by the daily Croner job.
 *
 * Parsing is delegated to `dns-lookup-parsers.ts` (pure, unit-tested).
 */

import { Resolver } from 'node:dns/promises'
import { parse as parseTld } from 'tldts'
import prisma from '../../../lib/prisma'
import type {
  DmarcLookup,
  SpfLookup,
  DkimLookup,
  MxLookup,
} from '../../generated/prisma/client'
import {
  parseDmarcRecord,
  parseSpfRecord,
  parseDkimRecord,
  sortMxRecords,
  findRecord,
  type MxRecord,
} from './dns-lookup-parsers'

const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1h
const DNS_TIMEOUT_MS = 5_000
const REFRESH_DELAY_MS = 100

export interface EmailAuthSnapshot {
  domain: string
  dmarc: DmarcLookup | null
  spf: SpfLookup | null
  dkim: DkimLookup[]
  mx: MxLookup | null
  /**
   * Full DMARC row inherited from a PSL ancestor when this domain has no
   * record of its own. RFC 7489 §6.6.3 describes the receiver-side fallback
   * to the organisational domain; this surfaces the same record in the UI.
   */
  inheritedDmarc: InheritedDmarcLookup | null
  /**
   * Full SPF row from a PSL ancestor when this domain has no record of its
   * own. SPF does NOT inherit in the protocol — receivers look up SPF at
   * exactly the Mail-From domain. This is informational reference only.
   */
  inheritedSpf: InheritedSpfLookup | null
}

/** A DMARC policy inherited from an ancestor domain via PSL-aware walking. */
export interface InheritedDmarc {
  /** The ancestor domain that publishes the record (e.g. `czepter.de`). */
  from: string
  /** Published policy (`none` / `quarantine` / `reject`), or null if unparsed. */
  policy: string | null
  /** Published `pct` value, or null if absent. */
  pct: number | null
}

/** Full inherited DMARC cache row, keyed back to the ancestor it came from. */
export interface InheritedDmarcLookup {
  from: string
  lookup: DmarcLookup
}

/** Full inherited SPF cache row (informational reference — SPF doesn't inherit). */
export interface InheritedSpfLookup {
  from: string
  lookup: SpfLookup
}

interface GetOptions {
  maxAgeMs?: number
  force?: boolean
}

/**
 * Cache-first read of all four record types for a domain. Refreshes rows that
 * are older than `maxAgeMs` (default 1h) or all rows if `force` is true.
 */
export async function getEmailAuth(
  domain: string,
  opts: GetOptions = {},
): Promise<EmailAuthSnapshot> {
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_TTL_MS
  const force = opts.force ?? false
  const now = Date.now()

  const stale = (row: { lookedUpAt: Date } | null): boolean => {
    if (force) return true
    if (!row) return true
    return now - row.lookedUpAt.getTime() > maxAgeMs
  }

  // Read existing cache entries (single batched read per table).
  const [dmarcRow, spfRow, mxRow, dkimRows] = await Promise.all([
    prisma.dmarcLookup.findUnique({ where: { domain } }),
    prisma.spfLookup.findUnique({ where: { domain } }),
    prisma.mxLookup.findUnique({ where: { domain } }),
    prisma.dkimLookup.findMany({ where: { domain } }),
  ])

  // Determine which selectors to look up — observed in reports, plus any
  // selector we already have a cached row for.
  const observedSelectors = await getObservedDkimSelectors(domain)
  const allSelectors = new Set<string>([
    ...observedSelectors,
    ...dkimRows.map(r => r.selector),
  ])

  // Refresh DMARC / SPF / MX in parallel if stale.
  const refreshTasks: Array<Promise<unknown>> = []
  if (stale(dmarcRow)) refreshTasks.push(refreshDmarc(domain))
  if (stale(spfRow)) refreshTasks.push(refreshSpf(domain))
  if (stale(mxRow)) refreshTasks.push(refreshMx(domain))

  // Refresh DKIM per stale selector.
  const dkimRowMap = new Map(dkimRows.map(r => [r.selector, r]))
  for (const selector of allSelectors) {
    const row = dkimRowMap.get(selector) ?? null
    if (stale(row)) refreshTasks.push(refreshDkim(domain, selector))
  }

  if (refreshTasks.length > 0) {
    await Promise.allSettled(refreshTasks)
  }

  // Re-read after refresh.
  const [dmarc, spf, mx, dkim] = await Promise.all([
    prisma.dmarcLookup.findUnique({ where: { domain } }),
    prisma.spfLookup.findUnique({ where: { domain } }),
    prisma.mxLookup.findUnique({ where: { domain } }),
    prisma.dkimLookup.findMany({
      where: { domain },
      orderBy: { selector: 'asc' },
    }),
  ])

  // Inheritance: walk PSL ancestors only when the local row is missing or has
  // no record. We share one walk for both DMARC and SPF since they typically
  // live on the same organisational domain — saves a DB round-trip per
  // candidate when both are needed. Parents not yet cached trigger a live DNS
  // refresh so first-access subdomains get inheritance immediately rather
  // than having to wait for the daily cron.
  const dmarcMissing = !dmarc || dmarc.record === null
  const spfMissing = !spf || spf.record === null
  let inheritedDmarc: InheritedDmarcLookup | null = null
  let inheritedSpf: InheritedSpfLookup | null = null

  if (dmarcMissing || spfMissing) {
    for (const candidate of getDmarcInheritanceCandidates(domain)) {
      if ((!dmarcMissing || inheritedDmarc) && (!spfMissing || inheritedSpf)) break

      if (dmarcMissing && !inheritedDmarc) {
        let row = await prisma.dmarcLookup.findUnique({ where: { domain: candidate } })
        if (!row) {
          await refreshDmarc(candidate)
          row = await prisma.dmarcLookup.findUnique({ where: { domain: candidate } })
        }
        if (row && !row.error && row.record) {
          inheritedDmarc = { from: candidate, lookup: row }
        }
      }

      if (spfMissing && !inheritedSpf) {
        let row = await prisma.spfLookup.findUnique({ where: { domain: candidate } })
        if (!row) {
          await refreshSpf(candidate)
          row = await prisma.spfLookup.findUnique({ where: { domain: candidate } })
        }
        if (row && !row.error && row.record) {
          inheritedSpf = { from: candidate, lookup: row }
        }
      }
    }
  }

  return { domain, dmarc, spf, mx, dkim, inheritedDmarc, inheritedSpf }
}

/**
 * Iterates every domain in `Domain` and force-refreshes its email-auth records.
 * Used by the daily Croner job. One bad domain doesn't abort the batch.
 */
export async function refreshAllEmailAuth(): Promise<{
  refreshed: number
  errors: number
}> {
  const domains = await prisma.domain.findMany({ select: { name: true } })
  let refreshed = 0
  let errors = 0
  for (const { name } of domains) {
    try {
      await getEmailAuth(name, { force: true })
      refreshed++
    }
    catch (err) {
      errors++
      console.error(`[dns-lookup] refresh failed for ${name}:`, (err as Error).message)
    }
    // DNS courtesy: small delay between domains to avoid bursty traffic.
    if (REFRESH_DELAY_MS > 0) await sleep(REFRESH_DELAY_MS)
  }
  return { refreshed, errors }
}

// ─── DMARC inheritance walking ──────────────────────────────────────────────

/**
 * True when a DmarcLookup row indicates the domain has no DMARC record.
 *
 * Distinguishes three states callers must not conflate:
 *   - `null` row           → never looked up. NOT missing — we don't know yet.
 *   - `record === null`    → looked up, no record found (NORECORD or DNS error).
 *   - `record !== null`    → has a record, regardless of whether `policy` parsed.
 *
 * Note: `policy === null` alone is a misleading check because a record like
 * `v=DMARC1; rua=mailto:x@y.com` (no `p=` tag) is technically present but
 * has `policy: null`. Using `record === null` avoids that false positive.
 */
export function isDmarcMissing(row: { record: string | null } | null): boolean {
  return row !== null && row.record === null
}


/**
 * Build the ordered list of ancestor domains to check for an inherited DMARC
 * record. Walks from the closest parent up to (and including) the registrable
 * domain — never above. Returns an empty list if the input is itself the
 * registrable domain or below the public-suffix boundary.
 *
 * Pure function — no DNS, no DB. Exported for unit testing.
 *
 * Examples:
 *   'haus.czepter.de'        → ['czepter.de']
 *   'mail.foo.example.co.uk' → ['foo.example.co.uk', 'example.co.uk']
 *   'czepter.de'             → []
 *   'de'                     → []
 */
export function getDmarcInheritanceCandidates(domain: string): string[] {
  // Normalise: lowercase per DNS case-insensitivity, strip trailing dot
  // (some sources include the FQDN root). Without this, uppercase or
  // trailing-dot inputs silently produce candidates that won't match any
  // stored Domain row (which is also lowercase, no trailing dot).
  const normalised = domain.replace(/\.$/, '').toLowerCase()
  const registrable = parseTld(normalised).domain
  if (!registrable) return []
  if (normalised === registrable) return []

  const labels = normalised.split('.')
  const registrableLabelCount = registrable.split('.').length
  const candidates: string[] = []
  // Strip one label at a time from the left, until the candidate length
  // equals the registrable domain's label count (inclusive).
  for (let i = 1; labels.length - i >= registrableLabelCount; i++) {
    candidates.push(labels.slice(i).join('.'))
  }
  return candidates
}

/**
 * Walk up the DNS tree from `domain` looking for an ancestor that publishes
 * a DMARC record. Stops at the registrable domain (PSL boundary) — bare TLDs
 * like `de`, `com`, or `co.uk` are never queried.
 *
 * Reads from the `DmarcLookup` cache; if no cache row exists for a candidate
 * (the ancestor may not be a policy domain in our system), `refreshFn` is
 * called to populate it via a live DNS lookup, then the cache is re-read.
 *
 * @param domain     A subdomain (e.g. 'haus.czepter.de').
 * @param refreshFn  Function that populates the DmarcLookup cache for one
 *                   domain. Defaults to the real `refreshDmarc`. Override in
 *                   tests to avoid live DNS.
 * @returns          The first ancestor that has a real DMARC record, or null.
 */
export async function findInheritedDmarc(
  domain: string,
  refreshFn: (d: string) => Promise<void> = refreshDmarc,
): Promise<InheritedDmarc | null> {
  const candidates = getDmarcInheritanceCandidates(domain)

  for (const candidate of candidates) {
    let row = await prisma.dmarcLookup.findUnique({ where: { domain: candidate } })
    if (!row) {
      // No cache row — populate via live DNS, then re-read.
      await refreshFn(candidate)
      row = await prisma.dmarcLookup.findUnique({ where: { domain: candidate } })
    }
    if (row && !row.error && row.record) {
      return { from: candidate, policy: row.policy, pct: row.pct }
    }
  }
  return null
}

// ─── per-record refreshers ──────────────────────────────────────────────────

export async function refreshDmarc(domain: string): Promise<void> {
  const result = await resolveTxtSafe(`_dmarc.${domain}`)
  if (result.error) {
    await prisma.dmarcLookup.upsert({
      where: { domain },
      create: { domain, error: result.error },
      update: {
        record: null,
        policy: null,
        subdomainPolicy: null,
        pct: null,
        rua: null,
        ruf: null,
        aspf: null,
        adkim: null,
        fo: null,
        error: result.error,
        lookedUpAt: new Date(),
      },
    })
    return
  }
  const record = findRecord(result.records, 'v=DMARC1')
  if (!record) {
    await prisma.dmarcLookup.upsert({
      where: { domain },
      create: { domain, error: 'NORECORD' },
      update: {
        record: null,
        policy: null,
        subdomainPolicy: null,
        pct: null,
        rua: null,
        ruf: null,
        aspf: null,
        adkim: null,
        fo: null,
        error: 'NORECORD',
        lookedUpAt: new Date(),
      },
    })
    return
  }
  const parsed = parseDmarcRecord(record)
  await prisma.dmarcLookup.upsert({
    where: { domain },
    create: { domain, record, ...parsed, error: null },
    update: { record, ...parsed, error: null, lookedUpAt: new Date() },
  })
}

async function refreshSpf(domain: string): Promise<void> {
  const result = await resolveTxtSafe(domain)
  if (result.error) {
    await prisma.spfLookup.upsert({
      where: { domain },
      create: { domain, error: result.error },
      update: {
        record: null,
        mechanisms: null,
        qualifierAll: null,
        includeCount: null,
        error: result.error,
        lookedUpAt: new Date(),
      },
    })
    return
  }
  const record = findRecord(result.records, 'v=spf1')
  if (!record) {
    await prisma.spfLookup.upsert({
      where: { domain },
      create: { domain, error: 'NORECORD' },
      update: {
        record: null,
        mechanisms: null,
        qualifierAll: null,
        includeCount: null,
        error: 'NORECORD',
        lookedUpAt: new Date(),
      },
    })
    return
  }
  const parsed = parseSpfRecord(record)
  await prisma.spfLookup.upsert({
    where: { domain },
    create: { domain, record, ...parsed, error: null },
    update: { record, ...parsed, error: null, lookedUpAt: new Date() },
  })
}

async function refreshDkim(domain: string, selector: string): Promise<void> {
  const result = await resolveTxtSafe(`${selector}._domainkey.${domain}`)
  if (result.error) {
    await prisma.dkimLookup.upsert({
      where: { domain_selector: { domain, selector } },
      create: { domain, selector, error: result.error, hasKey: false },
      update: {
        record: null,
        keyType: null,
        publicKey: null,
        hasKey: false,
        error: result.error,
        lookedUpAt: new Date(),
      },
    })
    return
  }
  const record = findRecord(result.records, 'v=DKIM1') ?? findRecord(result.records, 'k=')
    ?? findRecord(result.records, 'p=')
  if (!record) {
    await prisma.dkimLookup.upsert({
      where: { domain_selector: { domain, selector } },
      create: { domain, selector, error: 'NORECORD', hasKey: false },
      update: {
        record: null,
        keyType: null,
        publicKey: null,
        hasKey: false,
        error: 'NORECORD',
        lookedUpAt: new Date(),
      },
    })
    return
  }
  const parsed = parseDkimRecord(record)
  await prisma.dkimLookup.upsert({
    where: { domain_selector: { domain, selector } },
    create: { domain, selector, record, ...parsed, error: null },
    update: { record, ...parsed, error: null, lookedUpAt: new Date() },
  })
}

async function refreshMx(domain: string): Promise<void> {
  const resolver = makeResolver()
  let mxRecords: MxRecord[]
  try {
    const raw = await resolver.resolveMx(domain)
    mxRecords = sortMxRecords(raw.map(r => ({ priority: r.priority, exchange: r.exchange })))
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'EUNKNOWN'
    await prisma.mxLookup.upsert({
      where: { domain },
      create: { domain, error: code },
      update: {
        records: null,
        error: code,
        lookedUpAt: new Date(),
      },
    })
    return
  }
  await prisma.mxLookup.upsert({
    where: { domain },
    create: { domain, records: JSON.stringify(mxRecords), error: null },
    update: {
      records: JSON.stringify(mxRecords),
      error: null,
      lookedUpAt: new Date(),
    },
  })
}

// ─── DNS helpers ────────────────────────────────────────────────────────────

interface TxtResult {
  records: string[][]
  error: string | null
}

async function resolveTxtSafe(host: string): Promise<TxtResult> {
  const resolver = makeResolver()
  try {
    const records = await resolver.resolveTxt(host)
    return { records, error: null }
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'EUNKNOWN'
    return { records: [], error: code }
  }
}

function makeResolver(): Resolver {
  const r = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 })
  return r
}

async function getObservedDkimSelectors(domain: string): Promise<string[]> {
  const rows = await prisma.aggregateRecord.findMany({
    where: {
      dkimAuthDomain: domain,
      dkimAuthSelector: { not: null },
    },
    distinct: ['dkimAuthSelector'],
    select: { dkimAuthSelector: true },
  })
  return rows.map(r => r.dkimAuthSelector).filter((s): s is string => !!s)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
