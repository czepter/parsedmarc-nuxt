<script setup lang="ts">
definePageMeta({ layout: 'default' })

interface GeoData {
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

interface SiblingRecord {
  id: string
  sourceIp: string
  count: number
  disposition: string
  dkim: string
  spf: string
  headerFrom: string
  country: string | null
  spfAuthResult: string | null
  dkimAuthResult: string | null
}

interface ReportDetail {
  id: string
  orgReportId: string
  orgName: string
  dateBegin: string
  dateEnd: string
  domainName: string
  inboxLabel: string
  rawXml: string
  policyP: string | null
  policySp: string | null
  policyAdkim: string | null
  policyAspf: string | null
  policyPct: number | null
}

interface RecordDetailResponse {
  id: string
  sourceIp: string
  count: number
  disposition: string
  dkim: string
  spf: string
  headerFrom: string
  spfAuthDomain: string | null
  spfAuthResult: string | null
  dkimAuthDomain: string | null
  dkimAuthSelector: string | null
  dkimAuthResult: string | null
  dmarcCompliant: boolean
  geo: GeoData | null
  report: ReportDetail
  siblings: SiblingRecord[]
}

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

const { data, status, error } = await useFetch<RecordDetailResponse>(`/api/records/${id}`)

// ── helpers ────────────────────────────────────────────────────────────────
function alignClass(v: string | null): string {
  if (v === 'pass') return 'text-green-600 dark:text-green-400'
  if (v === 'fail') return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

function downloadXml() {
  if (!data.value || !import.meta.client) return
  const blob = new Blob([data.value.report.rawXml], { type: 'text/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dmarc-${data.value.report.orgReportId}.xml`
  a.click()
  URL.revokeObjectURL(url)
}

// ── protocol analysis helpers ──────────────────────────────────────────────

/**
 * Derive SPF/DKIM alignment from auth result + policy verdict.
 * - Auth fail → 'n/a' (alignment not evaluated)
 * - Auth pass + policy pass → 'pass'
 * - Auth pass + policy fail → 'fail'
 */
function deriveAlignment(authResult: string | null, policyResult: string): 'pass' | 'fail' | 'n/a' {
  if (!authResult || authResult !== 'pass') return 'n/a'
  return policyResult === 'pass' ? 'pass' : 'fail'
}

function alignmentLabel(a: 'pass' | 'fail' | 'n/a'): string {
  return a === 'n/a' ? '—' : a
}

function alignmentClass(a: 'pass' | 'fail' | 'n/a'): string {
  if (a === 'pass') return 'text-green-600 dark:text-green-400'
  if (a === 'fail') return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

function spfAuthExplanation(authResult: string | null): string {
  if (!authResult) return 'No SPF authentication data available for this record.'
  if (authResult === 'pass') return 'An SPF record authorizes this IP to send email.'
  if (authResult === 'fail') return 'No SPF record authorizes this IP for any domain.'
  if (authResult === 'softfail') return 'SPF returned softfail — the domain discourages this IP but does not prohibit it.'
  if (authResult === 'neutral') return 'SPF returned neutral — the domain makes no assertion about this IP.'
  return `SPF returned "${authResult}".`
}

function spfAlignExplanation(authResult: string | null, policyResult: string): string {
  const alignment = deriveAlignment(authResult, policyResult)
  if (alignment === 'n/a') return 'Alignment not evaluated — SPF authentication failed first.'
  if (alignment === 'pass') return 'The SPF-authorized domain matches your From: header domain.'
  return 'The SPF-authorized domain does not match your From: header. Common causes: mailing list forwarding, third-party sender not configured for alignment.'
}

function spfPolicyExplanation(policyResult: string): string {
  return policyResult === 'pass'
    ? 'DMARC accepted this message for SPF — authentication and alignment both passed.'
    : 'DMARC rejected this message for SPF — authentication or alignment failed.'
}

function dkimAuthExplanation(authResult: string | null): string {
  if (!authResult) return 'No DKIM authentication data available for this record.'
  if (authResult === 'pass') return 'A valid DKIM signature was found for this message.'
  if (authResult === 'fail') return 'The DKIM signature is missing, expired, or invalid.'
  if (authResult === 'policy') return 'DKIM signature exists but was rejected by a local policy.'
  if (authResult === 'neutral') return 'DKIM signature present but the result is neutral.'
  return `DKIM returned "${authResult}".`
}

function dkimAlignExplanation(authResult: string | null, policyResult: string): string {
  const alignment = deriveAlignment(authResult, policyResult)
  if (alignment === 'n/a') return 'Alignment not evaluated — DKIM authentication failed first.'
  if (alignment === 'pass') return 'The DKIM signing domain matches your From: header domain.'
  return "The DKIM signing domain does not match your From: header. Common cause: third-party sender (e.g. ESP) not configured with your domain's DKIM key."
}

function dkimPolicyExplanation(policyResult: string): string {
  return policyResult === 'pass'
    ? 'DMARC accepted this message for DKIM — authentication and alignment both passed.'
    : 'DMARC rejected this message for DKIM — authentication or alignment failed.'
}

function policyAlignLabel(alignment: string | null): string {
  if (alignment === 'r') return 'relaxed'
  if (alignment === 's') return 'strict'
  return alignment ?? '—'
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 p-6">

    <!-- Error -->
    <div
      v-if="status === 'error'"
      class="text-destructive rounded-md border p-12 text-center text-sm"
    >
      {{ error?.message ?? 'Failed to load record.' }}
    </div>

    <!-- Loading -->
    <div v-else-if="status === 'pending'" class="space-y-4">
      <div class="h-8 w-64 animate-pulse rounded bg-muted" />
      <div class="grid grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
      <div class="h-48 animate-pulse rounded-lg bg-muted" />
    </div>

    <!-- Success -->
    <template v-else-if="status === 'success' && data">

      <!-- Header -->
      <PageHeader :title="data.sourceIp" subtitle="Aggregate record">
        <template #right>
          <DispositionBadge :kind="(data.disposition as 'none' | 'quarantine' | 'reject')" />
        </template>
      </PageHeader>

      <!-- Stat tiles -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Messages</p>
            <p class="text-2xl font-bold tabular-nums">{{ data.count.toLocaleString('en-US') }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">DKIM</p>
            <p :class="['text-2xl font-bold', alignClass(data.dkim)]">{{ data.dkim }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">SPF</p>
            <p :class="['text-2xl font-bold', alignClass(data.spf)]">{{ data.spf }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Country</p>
            <p class="text-2xl font-bold">{{ data.geo?.country ?? '—' }}</p>
          </CardContent>
        </Card>
      </div>

      <!-- Metadata card -->
      <Card>
        <CardContent class="pt-4">
          <dl class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">

            <!-- Source IP -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Source IP</dt>
              <dd class="mt-0.5">
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-sm" as-child>
                  <NuxtLink :to="`/ips/${encodeURIComponent(data.sourceIp)}`">{{ data.sourceIp }}</NuxtLink>
                </Button>
              </dd>
            </div>

            <!-- Header From -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Header From</dt>
              <dd class="mt-0.5">
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-sm" as-child>
                  <NuxtLink :to="`/domains/${encodeURIComponent(data.headerFrom)}`">{{ data.headerFrom }}</NuxtLink>
                </Button>
              </dd>
            </div>

            <!-- Domain -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Domain</dt>
              <dd class="mt-0.5">
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-sm" as-child>
                  <NuxtLink :to="`/domains/${encodeURIComponent(data.report.domainName)}`">{{ data.report.domainName }}</NuxtLink>
                </Button>
              </dd>
            </div>

            <!-- Org name -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Reporting Org</dt>
              <dd class="mt-0.5 font-mono text-sm">{{ data.report.orgName }}</dd>
            </div>

            <!-- Inbox -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Inbox</dt>
              <dd class="mt-0.5 text-sm">{{ data.report.inboxLabel }}</dd>
            </div>

            <!-- Report date range -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Report Period</dt>
              <dd class="mt-0.5 text-sm tabular-nums">
                {{ new Date(data.report.dateBegin).toLocaleDateString('en-US') }}
                –
                {{ new Date(data.report.dateEnd).toLocaleDateString('en-US') }}
              </dd>
            </div>

            <!-- Geo city -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">City</dt>
              <dd class="mt-0.5 text-sm">{{ data.geo?.city ?? '—' }}</dd>
            </div>

            <!-- Geo coordinates -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Coordinates</dt>
              <dd class="mt-0.5 font-mono text-xs text-muted-foreground">
                <template v-if="data.geo?.latitude != null && data.geo?.longitude != null">
                  {{ data.geo.latitude.toFixed(4) }}, {{ data.geo.longitude.toFixed(4) }}
                </template>
                <template v-else>—</template>
              </dd>
            </div>

            <!-- Report ID -->
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Report ID</dt>
              <dd class="mt-0.5 font-mono text-xs text-muted-foreground break-all">{{ data.report.orgReportId }}</dd>
            </div>

            <!-- Published Policy -->
            <div v-if="data.report.policyP" class="col-span-2 sm:col-span-3">
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Published Policy</dt>
              <dd class="mt-0.5 text-sm font-mono space-x-2">
                <span>p={{ data.report.policyP }}</span>
                <template v-if="data.report.policySp">
                  <span class="text-muted-foreground">·</span>
                  <span>sp={{ data.report.policySp }}</span>
                </template>
                <template v-if="data.report.policyAdkim">
                  <span class="text-muted-foreground">·</span>
                  <span>adkim={{ policyAlignLabel(data.report.policyAdkim) }}</span>
                </template>
                <template v-if="data.report.policyAspf">
                  <span class="text-muted-foreground">·</span>
                  <span>aspf={{ policyAlignLabel(data.report.policyAspf) }}</span>
                </template>
                <template v-if="data.report.policyPct != null">
                  <span class="text-muted-foreground">·</span>
                  <span>pct={{ data.report.policyPct }}%</span>
                </template>
              </dd>
            </div>

          </dl>
        </CardContent>
      </Card>

      <!-- Protocol Analysis -->
      <div class="space-y-2">
        <h2 class="text-base font-semibold">Protocol Analysis</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">

          <!-- SPF card -->
          <Card>
            <CardContent class="pt-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                SPF
                <template v-if="data.spfAuthDomain">
                  <span class="font-normal normal-case mx-1">·</span>
                  <span class="font-mono font-normal normal-case">{{ data.spfAuthDomain }}</span>
                </template>
              </p>
              <div class="divide-y divide-border">

                <!-- Authentication -->
                <div class="py-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-muted-foreground">Authentication</span>
                    <span :class="['text-sm font-semibold', alignClass(data.spfAuthResult)]">
                      {{ data.spfAuthResult ?? '—' }}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {{ spfAuthExplanation(data.spfAuthResult) }}
                  </p>
                </div>

                <!-- Alignment -->
                <div class="py-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-muted-foreground">Alignment</span>
                    <span :class="['text-sm font-semibold', alignmentClass(deriveAlignment(data.spfAuthResult, data.spf))]">
                      {{ alignmentLabel(deriveAlignment(data.spfAuthResult, data.spf)) }}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {{ spfAlignExplanation(data.spfAuthResult, data.spf) }}
                  </p>
                </div>

                <!-- Policy -->
                <div class="py-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-muted-foreground">Policy</span>
                    <span :class="['text-sm font-semibold', alignClass(data.spf)]">{{ data.spf }}</span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {{ spfPolicyExplanation(data.spf) }}
                  </p>
                </div>

              </div>
            </CardContent>
          </Card>

          <!-- DKIM card -->
          <Card>
            <CardContent class="pt-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                DKIM
                <template v-if="data.dkimAuthDomain">
                  <span class="font-normal normal-case mx-1">·</span>
                  <span class="font-mono font-normal normal-case">{{ data.dkimAuthDomain }}</span>
                  <template v-if="data.dkimAuthSelector">
                    <span class="font-normal normal-case ml-1 opacity-60">({{ data.dkimAuthSelector }})</span>
                  </template>
                </template>
              </p>
              <div class="divide-y divide-border">

                <!-- Authentication -->
                <div class="py-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-muted-foreground">Authentication</span>
                    <span :class="['text-sm font-semibold', alignClass(data.dkimAuthResult)]">
                      {{ data.dkimAuthResult ?? '—' }}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {{ dkimAuthExplanation(data.dkimAuthResult) }}
                  </p>
                </div>

                <!-- Alignment -->
                <div class="py-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-muted-foreground">Alignment</span>
                    <span :class="['text-sm font-semibold', alignmentClass(deriveAlignment(data.dkimAuthResult, data.dkim))]">
                      {{ alignmentLabel(deriveAlignment(data.dkimAuthResult, data.dkim)) }}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {{ dkimAlignExplanation(data.dkimAuthResult, data.dkim) }}
                  </p>
                </div>

                <!-- Policy -->
                <div class="py-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-muted-foreground">Policy</span>
                    <span :class="['text-sm font-semibold', alignClass(data.dkim)]">{{ data.dkim }}</span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {{ dkimPolicyExplanation(data.dkim) }}
                  </p>
                </div>

              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      <!-- Raw XML download -->
      <Card>
        <CardContent class="pt-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">Raw XML Report</p>
              <p class="text-muted-foreground text-xs mt-0.5">
                Original DMARC aggregate report from {{ data.report.orgName }}
              </p>
            </div>
            <Button variant="outline" size="sm" @click="downloadXml">
              Download XML
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Sibling records -->
      <div v-if="data.siblings.length > 0" class="space-y-2">
        <h2 class="text-base font-semibold">
          Other records in this report
          <span class="text-muted-foreground text-sm font-normal ml-1">({{ data.siblings.length }})</span>
        </h2>
        <Card>
          <CardContent class="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source IP</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead class="text-right">Count</TableHead>
                  <TableHead>Disposition</TableHead>
                  <TableHead>Header From</TableHead>
                  <TableHead>DKIM</TableHead>
                  <TableHead>SPF</TableHead>
                  <TableHead class="text-right">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="sib in data.siblings" :key="sib.id">
                  <TableCell>
                    <Button variant="link" size="sm" class="h-auto p-0 font-mono text-xs" as-child>
                      <NuxtLink :to="`/ips/${encodeURIComponent(sib.sourceIp)}`">{{ sib.sourceIp }}</NuxtLink>
                    </Button>
                  </TableCell>
                  <TableCell class="text-sm">{{ sib.country ?? '—' }}</TableCell>
                  <TableCell class="text-right text-sm tabular-nums">
                    {{ sib.count.toLocaleString('en-US') }}
                  </TableCell>
                  <TableCell>
                    <DispositionBadge :kind="(sib.disposition as 'none' | 'quarantine' | 'reject')" size="sm" />
                  </TableCell>
                  <TableCell class="font-mono text-xs">{{ sib.headerFrom }}</TableCell>
                  <TableCell>
                    <span :class="['text-xs font-medium', alignClass(sib.dkim)]">{{ sib.dkim }}</span>
                  </TableCell>
                  <TableCell>
                    <span :class="['text-xs font-medium', alignClass(sib.spf)]">{{ sib.spf }}</span>
                  </TableCell>
                  <TableCell class="text-right">
                    <Button variant="link" size="sm" class="h-auto p-0 font-mono text-[11px] text-muted-foreground hover:text-foreground" as-child>
                      <NuxtLink :to="`/records/${sib.id}`">{{ sib.id.slice(0, 8) }} →</NuxtLink>
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <!-- No siblings notice -->
      <p v-else class="text-muted-foreground text-sm">
        This is the only record in its report batch.
      </p>

    </template>
  </div>
</template>
