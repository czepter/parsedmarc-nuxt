/**
 * Pure-function drift detection: compares three sources of DMARC truth
 * (DNS-published, report-published, receiver-observed) and classifies the
 * mismatch into one of five kinds.
 *
 * Kept DB-free so it can be unit-tested without mocks.
 */

export type DriftKind =
  | 'aligned'
  | 'no-dmarc'
  | 'dns-drift'
  | 'enforcement-drift'
  | 'escalation-drift'

export interface DriftReport {
  kind: DriftKind
  details: string
  dnsPolicy: string | null
  reportPolicy: string | null
  observed: Record<string, number>
  observedTotal: number
  windowDays: number
}

/**
 * Subset of `DmarcLookup` we need — only `record`, `policy`, `error`.
 * Defining a structural type keeps this util free of a Prisma client import.
 */
export interface DmarcLookupShape {
  record: string | null
  policy: string | null
  error: string | null
}

export interface DriftInput {
  dnsLookup: DmarcLookupShape | null
  latestReportPolicy: string | null
  dispositionCounts: Record<string, number>
  windowDays?: number
  /**
   * Policy inherited from an ancestor domain (organisational domain) when
   * this domain has no DMARC record of its own. When present, the absence
   * of a local DMARC record is no longer treated as misconfigured — the
   * domain is effectively covered by the parent's policy.
   */
  inheritedPolicy?: string | null
}

// Tunable thresholds (share of records considered "non-trivial").
const ENFORCEMENT_DRIFT_THRESHOLD = 0.05 // >5% of records bypassed an enforcing policy
const ESCALATION_DRIFT_THRESHOLD = 0.01 // >1% of records escalated past p=none
const DEFAULT_WINDOW_DAYS = 30

const ENFORCING_POLICIES = new Set(['quarantine', 'reject'])

export function detectDrift(input: DriftInput): DriftReport {
  const dnsPolicy = input.dnsLookup?.policy ?? null
  const reportPolicy = input.latestReportPolicy
  const observed = { ...input.dispositionCounts }
  const observedTotal = Object.values(observed).reduce((a, b) => a + b, 0)
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS

  const base = { dnsPolicy, reportPolicy, observed, observedTotal, windowDays }

  // 1. No DMARC at all (DNS missing AND no report-published policy).
  //    `error: NORECORD` or any DNS error counts as missing for this check.
  //    Exception: if an inherited policy exists (a parent organisational
  //    domain publishes DMARC), the domain is effectively covered — return
  //    aligned and let the inheritance UI handle messaging.
  const dnsMissing = !dnsPolicy
  if (dnsMissing && !reportPolicy) {
    if (input.inheritedPolicy) {
      return {
        ...base,
        kind: 'aligned',
        details: `No local DMARC record; policy inherited from an organisational ancestor (p=${input.inheritedPolicy}).`,
      }
    }
    return {
      ...base,
      kind: 'no-dmarc',
      details: 'No DMARC record published in DNS and no policy seen in any aggregate report.',
    }
  }

  // 2. DNS drift — DNS policy disagrees with the most recent report's policyP.
  //    A missing DNS record while a report still says a policy was published
  //    is still a mismatch (the policy disappeared since last ingest).
  if (reportPolicy && dnsPolicy !== reportPolicy) {
    return {
      ...base,
      kind: 'dns-drift',
      details: dnsPolicy
        ? `DNS publishes p=${dnsPolicy} but the most recent report states policyP=${reportPolicy}. Policy changed since last ingest.`
        : `No DMARC record published in DNS, but the most recent report states policyP=${reportPolicy}. The record may have been removed.`,
    }
  }

  // 3. Enforcement drift — DNS policy is enforcing (quarantine/reject) but a
  //    non-trivial share of observed records have disposition=none.
  if (dnsPolicy && ENFORCING_POLICIES.has(dnsPolicy) && observedTotal > 0) {
    const noneCount = observed.none ?? 0
    const noneShare = noneCount / observedTotal
    if (noneShare > ENFORCEMENT_DRIFT_THRESHOLD) {
      const pct = (noneShare * 100).toFixed(1)
      return {
        ...base,
        kind: 'enforcement-drift',
        details: `Published p=${dnsPolicy} but ${pct}% of observed messages were delivered (disposition=none) over the last ${windowDays} days. Common causes: pct<100, receiver overrides, allowlists.`,
      }
    }
  }

  // 4. Escalation drift — DNS publishes p=none but receivers quarantined or
  //    rejected a non-trivial share. Receiver-side reputation systems acting
  //    beyond what DMARC asked for.
  if (dnsPolicy === 'none' && observedTotal > 0) {
    const escalated = (observed.quarantine ?? 0) + (observed.reject ?? 0)
    const share = escalated / observedTotal
    if (share > ESCALATION_DRIFT_THRESHOLD) {
      const pct = (share * 100).toFixed(1)
      return {
        ...base,
        kind: 'escalation-drift',
        details: `Published p=none but ${pct}% of observed messages were quarantined or rejected by receivers over the last ${windowDays} days.`,
      }
    }
  }

  return {
    ...base,
    kind: 'aligned',
    details: 'Published policy matches the most recent report and observed enforcement is within thresholds.',
  }
}
