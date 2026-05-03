<script setup lang="ts">
definePageMeta({ layout: 'default' })

type DriftKind =
  | 'aligned'
  | 'no-dmarc'
  | 'dns-drift'
  | 'enforcement-drift'
  | 'escalation-drift'

interface DomainRow {
  name: string
  reportCount: number
  messageCount: number
  forensicCount: number
  dmarc: {
    policy: string | null
    pct: number | null
    hasRecord: boolean
    error: string | null
    lookedUpAt: string | null
  } | null
  spf: {
    hasRecord: boolean
    qualifierAll: string | null
    error: string | null
    lookedUpAt: string | null
  } | null
  dkimSelectorCount: number
  mx: {
    count: number
    error: string | null
    lookedUpAt: string | null
  } | null
  drift: DriftKind
  inheritedDmarc: {
    from: string
    policy: string | null
    pct: number | null
  } | null
  inheritedSpf: {
    from: string
    qualifierAll: string | null
  } | null
}

interface DomainsListResponse {
  domains: DomainRow[]
}

const { data, status, refresh } = await useFetch<DomainsListResponse>('/api/domains', {
  key: 'domains-list',
})

const search = ref('')
const refreshingDomain = ref<string | null>(null)

const filteredDomains = computed(() => {
  const q = search.value.trim().toLowerCase()
  const all = data.value?.domains ?? []
  if (!q) return all
  return all.filter(d => d.name.toLowerCase().includes(q))
})

async function refreshDomain(name: string) {
  refreshingDomain.value = name
  try {
    await $fetch(`/api/dns-lookup/${encodeURIComponent(name)}/refresh`, {
      method: 'POST',
    })
    await refresh()
  }
  finally {
    refreshingDomain.value = null
  }
}

function dmarcPolicyClass(policy: string | null): string {
  if (policy === 'reject') return 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
  if (policy === 'quarantine') return 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
  if (policy === 'none') return 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
  return 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
}

function spfQualifierClass(q: string | null): string {
  if (q === '-all' || q === '~all') return 'text-green-700 dark:text-green-400'
  if (q === '?all') return 'text-amber-700 dark:text-amber-400'
  if (q === '+all') return 'text-red-700 dark:text-red-400'
  return 'text-muted-foreground'
}

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
  <div class="mx-auto max-w-7xl space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Domains</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Reported-for domains with cached email-authentication DNS records and drift detection.
        </p>
      </div>
      <Input
        v-model="search"
        placeholder="Search domains…"
        class="h-9 w-64 text-sm"
      />
    </div>

    <!-- Error -->
    <div
      v-if="status === 'error'"
      class="rounded-md border p-12 text-center text-sm text-destructive"
    >
      Failed to load domains.
    </div>

    <!-- Loading -->
    <div v-else-if="status === 'pending'" class="space-y-3">
      <div class="h-12 animate-pulse rounded bg-muted" />
      <div class="h-12 animate-pulse rounded bg-muted" />
      <div class="h-12 animate-pulse rounded bg-muted" />
    </div>

    <!-- Empty -->
    <div
      v-else-if="data && data.domains.length === 0"
      class="rounded-md border p-12 text-center text-sm text-muted-foreground"
    >
      No reported-for domains yet. Once an inbox is connected and reports are
      ingested, domains will appear here.
    </div>

    <!-- Table -->
    <Card v-else>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead class="text-right">Reports</TableHead>
              <TableHead class="text-right">Messages</TableHead>
              <TableHead>DMARC</TableHead>
              <TableHead>SPF</TableHead>
              <TableHead class="text-right">DKIM</TableHead>
              <TableHead>MX</TableHead>
              <TableHead>Health</TableHead>
              <TableHead class="text-right">Looked up</TableHead>
              <TableHead class="text-right">Refresh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="d in filteredDomains" :key="d.name">
              <TableCell>
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-xs" as-child>
                  <NuxtLink :to="`/domains/${encodeURIComponent(d.name)}`">{{ d.name }}</NuxtLink>
                </Button>
              </TableCell>
              <TableCell class="text-right text-sm">{{ d.reportCount.toLocaleString('en-US') }}</TableCell>
              <TableCell class="text-right text-sm">{{ d.messageCount.toLocaleString('en-US') }}</TableCell>
              <TableCell>
                <!-- Domain has its own DMARC record -->
                <div v-if="d.dmarc?.hasRecord">
                  <span
                    :class="['inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', dmarcPolicyClass(d.dmarc.policy)]"
                  >
                    p={{ d.dmarc.policy ?? '—' }}
                  </span>
                </div>
                <!-- No own record but a parent does (RFC 7489 organisational fallback) -->
                <div v-else-if="d.inheritedDmarc">
                  <span
                    :class="['inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium italic opacity-80', dmarcPolicyClass(d.inheritedDmarc.policy)]"
                    :title="`Inherited from ${d.inheritedDmarc.from} (DMARC organisational-domain fallback per RFC 7489)`"
                  >
                    ↪ p={{ d.inheritedDmarc.policy ?? '—' }}
                  </span>
                  <div class="text-muted-foreground mt-0.5 text-[10px] leading-tight">
                    from {{ d.inheritedDmarc.from }}
                  </div>
                </div>
                <!-- Looked up, no record found -->
                <span
                  v-else-if="d.dmarc"
                  class="inline-flex items-center rounded-full border bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 px-2 py-0.5 text-xs font-medium"
                >
                  No record
                </span>
                <span v-else class="text-muted-foreground text-xs">—</span>
              </TableCell>
              <TableCell>
                <!-- Domain has its own SPF record -->
                <div v-if="d.spf?.hasRecord">
                  <span
                    :class="['font-mono text-xs', spfQualifierClass(d.spf.qualifierAll)]"
                  >
                    {{ d.spf.qualifierAll ?? '✓' }}
                  </span>
                </div>
                <!-- Reference SPF from parent (informational — SPF doesn't actually inherit) -->
                <div v-else-if="d.inheritedSpf">
                  <span
                    :class="['font-mono text-xs italic opacity-70', spfQualifierClass(d.inheritedSpf.qualifierAll)]"
                    :title="`Reference only: ${d.inheritedSpf.from} publishes SPF, but SPF does not inherit — receivers look up SPF at the exact domain in Mail-From.`"
                  >
                    ↪ {{ d.inheritedSpf.qualifierAll ?? '✓' }}
                  </span>
                  <div class="text-muted-foreground mt-0.5 text-[10px] leading-tight">
                    {{ d.inheritedSpf.from }}
                  </div>
                </div>
                <span
                  v-else-if="d.spf"
                  class="text-red-700 dark:text-red-400 text-xs"
                >
                  ✗
                </span>
                <span v-else class="text-muted-foreground text-xs">—</span>
              </TableCell>
              <TableCell class="text-right">
                <span v-if="d.dkimSelectorCount > 0" class="text-xs font-medium">
                  {{ d.dkimSelectorCount }}
                </span>
                <span v-else class="text-muted-foreground text-xs">0</span>
              </TableCell>
              <TableCell>
                <span v-if="d.mx && d.mx.count > 0" class="text-green-700 dark:text-green-400 text-xs">
                  {{ d.mx.count }}
                </span>
                <span v-else-if="d.mx" class="text-red-700 dark:text-red-400 text-xs">
                  ✗
                </span>
                <span v-else class="text-muted-foreground text-xs">—</span>
              </TableCell>
              <TableCell>
                <DriftBadge :kind="d.drift" size="sm" />
              </TableCell>
              <TableCell class="text-right text-xs text-muted-foreground">
                {{ relativeTime(d.dmarc?.lookedUpAt ?? d.spf?.lookedUpAt ?? d.mx?.lookedUpAt) }}
              </TableCell>
              <TableCell class="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 text-xs"
                  :disabled="refreshingDomain === d.name"
                  @click="refreshDomain(d.name)"
                >
                  {{ refreshingDomain === d.name ? '…' : '↻' }}
                </Button>
              </TableCell>
            </TableRow>
            <TableRow v-if="filteredDomains.length === 0">
              <TableCell colspan="10" class="py-8 text-center text-sm text-muted-foreground">
                No domains match the search.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <p v-if="data && data.domains.length > 0" class="text-xs text-muted-foreground">
      Showing {{ filteredDomains.length }} of {{ data.domains.length }} domains.
      DMARC/SPF/MX cached on a 1-hour TTL; DKIM selectors come from observed report data.
    </p>
  </div>
</template>
