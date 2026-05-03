/**
 * Pure parsing helpers for DMARC / SPF / DKIM / MX records.
 *
 * Split from `dns-lookup.ts` so they can be unit-tested without mocking DNS.
 * Inputs are strings (or arrays of strings, for raw TXT chunks); outputs are
 * structured objects that map directly onto Prisma columns.
 */

// ─── DMARC ──────────────────────────────────────────────────────────────────

export interface DmarcParsed {
  policy: string | null
  subdomainPolicy: string | null
  pct: number | null
  rua: string | null
  ruf: string | null
  aspf: string | null
  adkim: string | null
  fo: string | null
}

/**
 * Parses a DMARC TXT record (e.g. `v=DMARC1; p=none; rua=mailto:...`).
 * Tags are key=value pairs separated by `;`. Whitespace and trailing semicolons
 * are tolerated.
 */
export function parseDmarcRecord(record: string): DmarcParsed {
  const tags = parseTagList(record)
  const pctRaw = tags.get('pct')
  const pct = pctRaw !== undefined && /^\d+$/.test(pctRaw) ? Number(pctRaw) : null
  return {
    policy: tags.get('p') ?? null,
    subdomainPolicy: tags.get('sp') ?? null,
    pct,
    rua: tags.get('rua') ?? null,
    ruf: tags.get('ruf') ?? null,
    aspf: tags.get('aspf') ?? null,
    adkim: tags.get('adkim') ?? null,
    fo: tags.get('fo') ?? null,
  }
}

// ─── SPF ────────────────────────────────────────────────────────────────────

export interface SpfParsed {
  mechanisms: string
  qualifierAll: string | null
  includeCount: number
}

/**
 * Parses an SPF v1 record (e.g. `v=spf1 include:_spf.google.com -all`).
 * - `qualifierAll`: the qualifier on the trailing `all` mechanism. A bare `all`
 *   is treated as `+all` per RFC 7208 §4.6.2.
 * - `includeCount`: number of `include:` tokens (10 is the DNS lookup limit
 *   per RFC 7208 §4.6.4 — useful for surfacing risk).
 */
export function parseSpfRecord(record: string): SpfParsed {
  const trimmed = record.trim()
  const mechanisms = trimmed.startsWith('v=spf1')
    ? trimmed.slice('v=spf1'.length).trim()
    : trimmed
  const tokens = mechanisms.split(/\s+/).filter(Boolean)

  let qualifierAll: string | null = null
  for (const tok of tokens) {
    const m = /^([+\-~?]?)all$/.exec(tok)
    if (m) {
      const q = m[1] || '+'
      qualifierAll = `${q}all`
      break
    }
  }

  const includeCount = tokens.filter(t => t.toLowerCase().startsWith('include:')).length

  return { mechanisms, qualifierAll, includeCount }
}

// ─── DKIM ───────────────────────────────────────────────────────────────────

export interface DkimParsed {
  keyType: string | null
  publicKey: string | null
  hasKey: boolean
}

/**
 * Parses a DKIM TXT record (e.g. `v=DKIM1; k=rsa; p=MIGf...`).
 * - An empty `p=` value indicates a revoked key (RFC 6376 §3.6.1).
 */
export function parseDkimRecord(record: string): DkimParsed {
  const tags = parseTagList(record)
  const publicKey = tags.has('p') ? (tags.get('p') ?? '') : null
  return {
    keyType: tags.get('k') ?? null,
    publicKey,
    hasKey: typeof publicKey === 'string' && publicKey.length > 0,
  }
}

// ─── MX ─────────────────────────────────────────────────────────────────────

export interface MxRecord {
  priority: number
  exchange: string
}

/** Stable sort by priority ascending (lowest priority = preferred). */
export function sortMxRecords(records: readonly MxRecord[]): MxRecord[] {
  return [...records]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.priority - b.r.priority || a.i - b.i)
    .map(({ r }) => r)
}

// ─── TXT helpers ────────────────────────────────────────────────────────────

/**
 * DNS TXT records are returned as arrays of strings (chunks) by Node's
 * `dns.resolveTxt`. RFC 7208 / 6376 / 7489 all say to concatenate without
 * a separator.
 */
export function joinTxtChunks(chunks: readonly string[]): string {
  return chunks.join('')
}

/**
 * Given the array-of-arrays returned by `dns.resolveTxt(...)`, returns the
 * first joined record whose joined value starts with `prefix` (case-insensitive
 * on the prefix), or null if none match.
 */
export function findRecord(
  txts: readonly (readonly string[])[],
  prefix: string,
): string | null {
  const lcPrefix = prefix.toLowerCase()
  for (const chunks of txts) {
    const joined = joinTxtChunks(chunks)
    if (joined.toLowerCase().startsWith(lcPrefix)) return joined
  }
  return null
}

// ─── internal ──────────────────────────────────────────────────────────────

/** Parse a `k1=v1; k2=v2` style tag list into a Map. Keys lowercased. */
function parseTagList(record: string): Map<string, string> {
  const tags = new Map<string, string>()
  for (const part of record.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const value = part.slice(eq + 1).trim()
    if (key) tags.set(key, value)
  }
  return tags
}
