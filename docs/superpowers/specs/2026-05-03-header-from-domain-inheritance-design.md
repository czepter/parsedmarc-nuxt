# Header-From Domain Inheritance

**Date:** 2026-05-03
**Status:** Approved

## Problem

DMARC aggregate reports contain two distinct domain concepts:

1. `policy_published.domain` — the domain that owns the DMARC DNS record (e.g. `czepter.de`). Stored as a `Domain` row and linked to `AggregateReport.domainId`.
2. `identifiers.header_from` — the actual `From:` header domain of the reported email (e.g. `haus.czepter.de`). Stored as a plain string in `AggregateRecord.headerFrom`.

These can legitimately differ: a subdomain sends email, its parent owns the DMARC policy. Currently, `headerFrom` domains are never added to the `Domain` table, so clicking `haus.czepter.de` in the records list hits `GET /api/domains/haus.czepter.de` and receives a 404.

## Goal

`headerFrom` domains are treated as first-class domains. They appear in the Domains list, have a working detail page, and the detail page explains that the domain inherits its DMARC policy from the parent domain.

No backfill — the user will reset the database. Only domains encountered from the next ingestion run onwards are tracked.

## Approach

Option A — ingest-time upsert. During ingestion, after the existing policy domain upsert, also upsert each distinct `headerFrom` value as a `Domain` row. All existing features (DNS lookup, drift, list page, detail page) then work unchanged because the domain is a real row. The only new logic is parent-DMARC inheritance detection, isolated to `dns-lookup.ts`.

## Design

### 1. Data Layer — no schema changes

`ingest.ts`, inside the aggregate report processing loop, after the existing policy domain upsert:

```ts
// Collect distinct, non-empty headerFrom values for this report
const headerFromDomains = new Set(
  report.records.map(r => r.headerFrom).filter(Boolean)
)
for (const hf of headerFromDomains) {
  await prisma.domain.upsert({
    where: { name: hf },
    create: { name: hf },
    update: {},
  })
}
```

Empty strings are filtered out before the loop. TLD/PSL boundary enforcement happens inside `findInheritedDmarc`, not here — any non-empty `headerFrom` value is a valid domain to upsert.

### 2. Parent DMARC Inheritance Detection

New dependency: `tldts` (lightweight PSL library, ~5 KB, zero deps). Used only to identify the registrable domain (PSL boundary), preventing the walker from checking bare TLDs like `de`, `com`, or `co.uk`.

New function `findInheritedDmarc(domain: string)` in `dns-lookup.ts`:

1. Use `tldts.parse(domain)` to get `registrableDomain` (e.g. `czepter.de` from `haus.czepter.de`).
2. Strip labels one at a time from the left of `domain`, stopping once the candidate equals `registrableDomain` (inclusive — the registrable domain itself is a valid candidate).
3. At each candidate, read from `DmarcLookup` cache in the DB. If no cache row exists (the parent may not be a policy domain and may never have been looked up), call `refreshDmarc(candidate)` inline to populate it first. This is safe — `refreshDmarc` handles DNS errors gracefully and always writes a row.
4. Return the first parent that has a real DMARC record (`error` is null and `record` is non-null), or `null` if none found.

Walk example:
```
haus.czepter.de  →  try czepter.de  →  found p=none  →  return
mail.a.example.co.uk  →  try a.example.co.uk  →  NORECORD
                        →  try example.co.uk   →  found p=reject  →  return
                        (co.uk and uk are never checked)
```

`findInheritedDmarc` is called only when a domain's own `DmarcLookup.error === 'NORECORD'`.

### 3. API Changes

**`GET /api/domains` (list)**

New field on each domain row:

```ts
inheritedDmarc: {
  from: string        // e.g. 'czepter.de'
  policy: string | null
  pct: number | null
} | null
```

Set by calling `findInheritedDmarc` for any domain whose own DMARC lookup is `NORECORD`. Domains with their own valid record get `null`.

**`GET /api/domains/[name]` (detail)**

Two additions:

1. Same `inheritedDmarc` field as the list endpoint.

2. Fallback stats query for `headerFrom` domains. After fetching the domain row, check whether it has any linked `AggregateReport`s. If none (it is a `headerFrom`-only domain), query for stats via `AggregateRecord.findMany({ where: { headerFrom: domain.name } })` instead of via `report.domainId`. The "recent reports" section is omitted for these domains.

No other endpoints change.

### 4. UI Changes

**Domains list (`domains/index.vue`)**

No visual change. `haus.czepter.de` appears as a plain row alongside policy domains. The inheritance information is only surfaced on the detail page.

**Domain detail page (`domains/[name].vue`)**

When `inheritedDmarc` is present, a banner card appears at the top of the page:

```
ℹ This domain has no DMARC record of its own.
  It inherits its policy from czepter.de — p=none, pct=100.
```

The banner links `czepter.de` to its own domain detail page.

The IP stats and message count cards use the `headerFrom`-based stats returned by the API.

The "Recent Reports" section is replaced with a single line:
> *Reports are filed under the policy domain [czepter.de →].*

**Records list (`records/index.vue`)**

No change required. The `headerFrom` link now resolves correctly because the Domain row exists.

## Implementation Order

1. Add `tldts` dependency.
2. Add `findInheritedDmarc` to `dns-lookup.ts`.
3. Update `ingest.ts` to upsert `headerFrom` domains.
4. Update `GET /api/domains` list to include `inheritedDmarc`.
5. Update `GET /api/domains/[name]` to include `inheritedDmarc` and fallback stats.
6. Update domain detail page (`[name].vue`) to render the inheritance banner and adapted stats.

## Out of Scope

- Backfill of existing data (user will reset).
- Visual differentiation of inherited domains in the Domains list.
- Drift analysis for inherited domains (drift badge shows existing "no-dmarc" or "aligned" states as normal — the inherited policy is informational only).
- Forensic reports for `headerFrom` domains (no change to forensic ingestion).
