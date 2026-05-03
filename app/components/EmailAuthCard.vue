<script setup lang="ts">
interface DmarcLookup {
  domain: string
  record: string | null
  policy: string | null
  subdomainPolicy: string | null
  pct: number | null
  rua: string | null
  ruf: string | null
  aspf: string | null
  adkim: string | null
  fo: string | null
  error: string | null
  lookedUpAt: string
}

interface SpfLookup {
  domain: string
  record: string | null
  mechanisms: string | null
  qualifierAll: string | null
  includeCount: number | null
  error: string | null
  lookedUpAt: string
}

interface DkimLookup {
  domain: string
  selector: string
  record: string | null
  keyType: string | null
  publicKey: string | null
  hasKey: boolean
  error: string | null
  lookedUpAt: string
}

interface MxLookup {
  domain: string
  records: string | null
  error: string | null
  lookedUpAt: string
}

interface EmailAuthSnapshot {
  domain: string
  dmarc: DmarcLookup | null
  spf: SpfLookup | null
  dkim: DkimLookup[]
  mx: MxLookup | null
  inheritedDmarc: { from: string; lookup: DmarcLookup } | null
  inheritedSpf: { from: string; lookup: SpfLookup } | null
}

const props = defineProps<{
  domain: string
}>()

const { data, status, refresh } = await useFetch<EmailAuthSnapshot>(
  `/api/dns-lookup/${encodeURIComponent(props.domain)}`,
  { key: `dns-lookup-${props.domain}` },
)

const refreshing = ref(false)

async function refreshAll() {
  refreshing.value = true
  try {
    await $fetch(`/api/dns-lookup/${encodeURIComponent(props.domain)}/refresh`, {
      method: 'POST',
    })
    await refresh()
  }
  finally {
    refreshing.value = false
  }
}

// ── DMARC / SPF styling helpers (plain functions so they work for either
//    the domain's own record or an inherited parent record).
function dmarcPolicyClass(policy: string | null | undefined): string {
  if (policy === 'reject') return 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
  if (policy === 'quarantine') return 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
  if (policy === 'none') return 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
  return 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
}

function spfQualifierClass(qualifier: string | null | undefined): string {
  if (qualifier === '-all' || qualifier === '~all') return 'text-green-700 dark:text-green-400'
  if (qualifier === '?all') return 'text-amber-700 dark:text-amber-400'
  if (qualifier === '+all') return 'text-red-700 dark:text-red-400'
  return 'text-muted-foreground'
}

const spfIncludeWarn = computed(() => {
  const c = data.value?.spf?.includeCount ?? 0
  return c > 10
})

// ── MX records parsed from the JSON column
const mxRecords = computed<Array<{ priority: number; exchange: string }>>(() => {
  const raw = data.value?.mx?.records
  if (!raw) return []
  try {
    return JSON.parse(raw)
  }
  catch {
    return []
  }
})

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  const diffMs = Date.now() - t
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <CardTitle class="text-base">Email Authentication</CardTitle>
          <p class="text-xs text-muted-foreground">
            DNS-published DMARC, SPF, DKIM, and MX records for this domain.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          :disabled="refreshing"
          @click="refreshAll"
        >
          {{ refreshing ? 'Refreshing…' : 'Refresh' }}
        </Button>
      </div>
    </CardHeader>

    <CardContent class="space-y-6">
      <!-- Loading skeleton -->
      <div v-if="status === 'pending'" class="space-y-4">
        <div v-for="i in 4" :key="i" class="h-16 animate-pulse rounded-md bg-muted" />
      </div>

      <template v-else-if="data">
        <!-- DMARC -->
        <section class="space-y-2">
          <div class="flex items-center gap-3">
            <h3 class="text-sm font-semibold">DMARC</h3>
            <!-- Domain has its own record -->
            <span
              v-if="data.dmarc?.record"
              :class="['inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', dmarcPolicyClass(data.dmarc.policy)]"
            >
              p={{ data.dmarc.policy ?? '—' }}<span v-if="data.dmarc.pct !== null && data.dmarc.pct < 100">; pct={{ data.dmarc.pct }}</span>
            </span>
            <!-- No own record but a PSL ancestor publishes one (RFC 7489 §6.6.3 fallback) -->
            <span
              v-else-if="data.inheritedDmarc"
              :class="['inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium italic opacity-80', dmarcPolicyClass(data.inheritedDmarc.lookup.policy)]"
              :title="`Inherited from ${data.inheritedDmarc.from} via the DMARC organisational-domain fallback (RFC 7489 §6.6.3).`"
            >
              ↪ p={{ data.inheritedDmarc.lookup.policy ?? '—' }}<span v-if="data.inheritedDmarc.lookup.pct !== null && data.inheritedDmarc.lookup.pct < 100">; pct={{ data.inheritedDmarc.lookup.pct }}</span>
            </span>
            <span
              v-else
              class="inline-flex items-center rounded-full border bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 px-2 py-0.5 text-xs font-medium"
            >
              No record ({{ data.dmarc?.error ?? 'not looked up' }})
            </span>
            <span class="ml-auto text-xs text-muted-foreground">
              {{ relativeTime((data.dmarc?.record ? data.dmarc?.lookedUpAt : data.inheritedDmarc?.lookup.lookedUpAt) ?? data.dmarc?.lookedUpAt) }}
            </span>
          </div>

          <!-- Inheritance hint line -->
          <p
            v-if="!data.dmarc?.record && data.inheritedDmarc"
            class="text-xs text-muted-foreground"
          >
            Inherited from <span class="font-mono">{{ data.inheritedDmarc.from }}</span> — RFC 7489 organisational-domain fallback. Receivers without a record at <span class="font-mono">{{ data.domain }}</span> apply this policy.
          </p>

          <!-- Parsed tags grid: own record OR inherited record -->
          <div
            v-if="data.dmarc?.record || data.inheritedDmarc"
            class="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3"
            :class="{ 'opacity-80 italic': !data.dmarc?.record && data.inheritedDmarc }"
          >
            <template v-for="d in [data.dmarc?.record ? data.dmarc : data.inheritedDmarc?.lookup].filter(Boolean) as DmarcLookup[]" :key="d.domain">
              <div v-if="d.subdomainPolicy">
                <span class="text-muted-foreground">sp:</span> {{ d.subdomainPolicy }}
              </div>
              <div v-if="d.aspf">
                <span class="text-muted-foreground">aspf:</span> {{ d.aspf }}
              </div>
              <div v-if="d.adkim">
                <span class="text-muted-foreground">adkim:</span> {{ d.adkim }}
              </div>
              <div v-if="d.fo">
                <span class="text-muted-foreground">fo:</span> {{ d.fo }}
              </div>
              <div v-if="d.rua" class="col-span-2 truncate">
                <span class="text-muted-foreground">rua:</span> <span class="font-mono">{{ d.rua }}</span>
              </div>
              <div v-if="d.ruf" class="col-span-2 truncate">
                <span class="text-muted-foreground">ruf:</span> <span class="font-mono">{{ d.ruf }}</span>
              </div>
            </template>
          </div>

          <code
            v-if="data.dmarc?.record"
            class="block break-all rounded bg-muted px-2 py-1 font-mono text-[11px] leading-relaxed"
          >{{ data.dmarc.record }}</code>
          <code
            v-else-if="data.inheritedDmarc"
            class="block break-all rounded bg-muted/60 px-2 py-1 font-mono text-[11px] leading-relaxed italic opacity-80"
          >{{ data.inheritedDmarc.lookup.record }}</code>
        </section>

        <Separator />

        <!-- SPF -->
        <section class="space-y-2">
          <div class="flex items-center gap-3">
            <h3 class="text-sm font-semibold">SPF</h3>
            <!-- Domain has its own SPF -->
            <span v-if="data.spf?.record" class="text-xs">
              <span :class="['font-mono', spfQualifierClass(data.spf.qualifierAll)]">
                {{ data.spf.qualifierAll ?? '(no all)' }}
              </span>
              <span class="text-muted-foreground">·</span>
              <span :class="spfIncludeWarn ? 'text-red-700 dark:text-red-400 font-medium' : ''">
                {{ data.spf.includeCount ?? 0 }} include{{ (data.spf.includeCount ?? 0) === 1 ? '' : 's' }}
              </span>
              <span v-if="spfIncludeWarn" class="text-xs text-red-700 dark:text-red-400 ml-1">
                (>10 lookup limit)
              </span>
            </span>
            <!-- Reference SPF from a parent (informational — SPF doesn't actually inherit) -->
            <span
              v-else-if="data.inheritedSpf"
              class="text-xs italic opacity-70"
              :title="`Reference only: ${data.inheritedSpf.from} publishes SPF, but SPF does NOT inherit (RFC 7208) — receivers look up SPF at exactly the Mail-From domain.`"
            >
              <span :class="['font-mono', spfQualifierClass(data.inheritedSpf.lookup.qualifierAll)]">
                ↪ {{ data.inheritedSpf.lookup.qualifierAll ?? '(no all)' }}
              </span>
              <span class="text-muted-foreground">·</span>
              <span>
                {{ data.inheritedSpf.lookup.includeCount ?? 0 }} include{{ (data.inheritedSpf.lookup.includeCount ?? 0) === 1 ? '' : 's' }}
              </span>
            </span>
            <span
              v-else
              class="inline-flex items-center rounded-full border bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 px-2 py-0.5 text-xs font-medium"
            >
              No record ({{ data.spf?.error ?? 'not looked up' }})
            </span>
            <span class="ml-auto text-xs text-muted-foreground">
              {{ relativeTime((data.spf?.record ? data.spf?.lookedUpAt : data.inheritedSpf?.lookup.lookedUpAt) ?? data.spf?.lookedUpAt) }}
            </span>
          </div>

          <!-- Reference-only caveat for inherited SPF -->
          <p
            v-if="!data.spf?.record && data.inheritedSpf"
            class="text-xs text-muted-foreground"
          >
            Parent <span class="font-mono">{{ data.inheritedSpf.from }}</span> publishes SPF — shown for reference. SPF does <strong>not</strong> inherit per RFC 7208; mail from <span class="font-mono">{{ data.domain }}</span> still fails SPF unless the subdomain publishes its own record.
          </p>

          <code
            v-if="data.spf?.record"
            class="block break-all rounded bg-muted px-2 py-1 font-mono text-[11px] leading-relaxed"
          >{{ data.spf.record }}</code>
          <code
            v-else-if="data.inheritedSpf"
            class="block break-all rounded bg-muted/60 px-2 py-1 font-mono text-[11px] leading-relaxed italic opacity-80"
          >{{ data.inheritedSpf.lookup.record }}</code>
        </section>

        <Separator />

        <!-- DKIM -->
        <section class="space-y-2">
          <div class="flex items-center gap-3">
            <h3 class="text-sm font-semibold">DKIM</h3>
            <span class="text-xs text-muted-foreground">
              {{ data.dkim.length }} selector{{ data.dkim.length === 1 ? '' : 's' }} observed in reports
            </span>
          </div>

          <div v-if="data.dkim.length === 0" class="text-xs text-muted-foreground italic">
            No DKIM selectors observed in any aggregate report yet.
          </div>

          <div v-else class="rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="h-8 text-xs">Selector</TableHead>
                  <TableHead class="h-8 text-xs">Key Type</TableHead>
                  <TableHead class="h-8 text-xs">Status</TableHead>
                  <TableHead class="h-8 text-xs text-right">Looked up</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="d in data.dkim" :key="d.selector">
                  <TableCell class="font-mono text-xs">{{ d.selector }}</TableCell>
                  <TableCell class="text-xs">{{ d.keyType ?? '—' }}</TableCell>
                  <TableCell class="text-xs">
                    <span v-if="d.error" class="text-red-700 dark:text-red-400">
                      {{ d.error }}
                    </span>
                    <span v-else-if="d.hasKey" class="text-green-700 dark:text-green-400">
                      Active
                    </span>
                    <span v-else class="text-amber-700 dark:text-amber-400">
                      Revoked (empty p=)
                    </span>
                  </TableCell>
                  <TableCell class="text-right text-xs text-muted-foreground">
                    {{ relativeTime(d.lookedUpAt) }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>

        <Separator />

        <!-- MX -->
        <section class="space-y-2">
          <div class="flex items-center gap-3">
            <h3 class="text-sm font-semibold">MX</h3>
            <span v-if="mxRecords.length > 0" class="text-xs text-muted-foreground">
              {{ mxRecords.length }} host{{ mxRecords.length === 1 ? '' : 's' }}
            </span>
            <span
              v-else
              class="inline-flex items-center rounded-full border bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 px-2 py-0.5 text-xs font-medium"
            >
              No MX ({{ data.mx?.error ?? 'not looked up' }})
            </span>
            <span class="ml-auto text-xs text-muted-foreground">
              {{ relativeTime(data.mx?.lookedUpAt) }}
            </span>
          </div>
          <ul v-if="mxRecords.length > 0" class="space-y-0.5 text-xs">
            <li
              v-for="m in mxRecords"
              :key="`${m.priority}-${m.exchange}`"
              class="flex gap-3 font-mono"
            >
              <span class="text-muted-foreground w-8 text-right">{{ m.priority }}</span>
              <span>{{ m.exchange }}</span>
            </li>
          </ul>
        </section>
      </template>
    </CardContent>
  </Card>
</template>
