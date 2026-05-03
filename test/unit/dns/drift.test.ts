import { describe, it, expect } from 'vitest'
import { detectDrift, type DmarcLookupShape } from '../../../app/server/utils/drift'

function dns(policy: string | null): DmarcLookupShape {
  return {
    record: policy ? `v=DMARC1; p=${policy}` : null,
    policy,
    error: null,
  }
}

describe('detectDrift', () => {
  it('returns "no-dmarc" when both DNS and report data are absent', () => {
    const r = detectDrift({
      dnsLookup: null,
      latestReportPolicy: null,
      dispositionCounts: {},
    })
    expect(r.kind).toBe('no-dmarc')
  })

  it('returns "no-dmarc" when DNS lookup has an error and no report policy', () => {
    const r = detectDrift({
      dnsLookup: { record: null, policy: null, error: 'ENOTFOUND' },
      latestReportPolicy: null,
      dispositionCounts: {},
    })
    expect(r.kind).toBe('no-dmarc')
  })

  it('returns "dns-drift" when DNS p differs from latest report policyP', () => {
    const r = detectDrift({
      dnsLookup: dns('reject'),
      latestReportPolicy: 'none',
      dispositionCounts: { none: 1000 },
    })
    expect(r.kind).toBe('dns-drift')
    expect(r.dnsPolicy).toBe('reject')
    expect(r.reportPolicy).toBe('none')
  })

  it('returns "enforcement-drift" when published p=quarantine but most messages get disposition=none', () => {
    const r = detectDrift({
      dnsLookup: dns('quarantine'),
      latestReportPolicy: 'quarantine',
      dispositionCounts: { none: 100, quarantine: 5 },
    })
    expect(r.kind).toBe('enforcement-drift')
  })

  it('returns "enforcement-drift" when published p=reject but receivers deliver some', () => {
    const r = detectDrift({
      dnsLookup: dns('reject'),
      latestReportPolicy: 'reject',
      dispositionCounts: { reject: 50, none: 10 },
    })
    expect(r.kind).toBe('enforcement-drift')
  })

  it('returns "aligned" when published p=reject and disposition=none is below 5% threshold', () => {
    const r = detectDrift({
      dnsLookup: dns('reject'),
      latestReportPolicy: 'reject',
      dispositionCounts: { reject: 1000, none: 30 }, // ~3%
    })
    expect(r.kind).toBe('aligned')
  })

  it('returns "escalation-drift" when published p=none but receivers quarantine/reject above 1%', () => {
    const r = detectDrift({
      dnsLookup: dns('none'),
      latestReportPolicy: 'none',
      dispositionCounts: { none: 950, quarantine: 30, reject: 20 }, // 5%
    })
    expect(r.kind).toBe('escalation-drift')
  })

  it('returns "aligned" when published p=none and escalations are below 1% threshold', () => {
    const r = detectDrift({
      dnsLookup: dns('none'),
      latestReportPolicy: 'none',
      dispositionCounts: { none: 10000, quarantine: 50 }, // 0.5%
    })
    expect(r.kind).toBe('aligned')
  })

  it('returns "aligned" when policies match and observed disposition matches', () => {
    const r = detectDrift({
      dnsLookup: dns('quarantine'),
      latestReportPolicy: 'quarantine',
      dispositionCounts: { quarantine: 500, none: 5 }, // 1% noise
    })
    expect(r.kind).toBe('aligned')
  })

  it('treats no observed records as aligned (when DNS exists, no traffic to check)', () => {
    const r = detectDrift({
      dnsLookup: dns('reject'),
      latestReportPolicy: 'reject',
      dispositionCounts: {},
    })
    expect(r.kind).toBe('aligned')
  })

  it('returns "dns-drift" before "enforcement-drift" if both apply (DNS mismatch dominates)', () => {
    const r = detectDrift({
      dnsLookup: dns('reject'),
      latestReportPolicy: 'none',
      dispositionCounts: { none: 100 },
    })
    expect(r.kind).toBe('dns-drift')
  })

  it('exposes dispositionCounts and totals for the UI', () => {
    const r = detectDrift({
      dnsLookup: dns('quarantine'),
      latestReportPolicy: 'quarantine',
      dispositionCounts: { none: 50, quarantine: 50 },
    })
    expect(r.observedTotal).toBe(100)
    expect(r.observed).toEqual({ none: 50, quarantine: 50 })
  })

  it('returns no-dmarc when DNS has no policy AND no traffic was observed', () => {
    const r = detectDrift({
      dnsLookup: { record: null, policy: null, error: 'NORECORD' },
      latestReportPolicy: null,
      dispositionCounts: {},
    })
    expect(r.kind).toBe('no-dmarc')
  })

  it('still detects drift when DNS has no policy but report policy was observed', () => {
    const r = detectDrift({
      dnsLookup: { record: null, policy: null, error: 'NORECORD' },
      latestReportPolicy: 'quarantine',
      dispositionCounts: { quarantine: 100 },
    })
    expect(r.kind).toBe('dns-drift')
  })

  // ─── inheritedPolicy cases ────────────────────────────────────────────────

  it('returns "aligned" with inheritance details when no local DMARC but parent publishes one', () => {
    const r = detectDrift({
      dnsLookup: { record: null, policy: null, error: 'NORECORD' },
      latestReportPolicy: null,
      dispositionCounts: {},
      inheritedPolicy: 'reject',
    })
    expect(r.kind).toBe('aligned')
    expect(r.details).toContain('inherited')
    expect(r.details).toContain('reject')
  })

  it('still returns "no-dmarc" when neither local nor inherited policy exists', () => {
    const r = detectDrift({
      dnsLookup: { record: null, policy: null, error: 'NORECORD' },
      latestReportPolicy: null,
      dispositionCounts: {},
      inheritedPolicy: null,
    })
    expect(r.kind).toBe('no-dmarc')
  })

  it('inheritedPolicy is only consulted when DNS is missing AND no report policy', () => {
    // Local DNS policy present — inheritance should be ignored.
    const r = detectDrift({
      dnsLookup: dns('reject'),
      latestReportPolicy: 'reject',
      dispositionCounts: { reject: 100 },
      inheritedPolicy: 'none', // would mismatch, but we ignore it
    })
    expect(r.kind).toBe('aligned')
  })
})
