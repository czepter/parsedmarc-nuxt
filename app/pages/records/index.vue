<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

definePageMeta({ layout: 'default' })

// ── types ─────────────────────────────────────────────────────────────────
interface RecordRow {
  id: string
  dateBegin: string
  sourceIp: string
  country: string | null
  count: number
  disposition: string
  headerFrom: string
  dkim: string
  spf: string
  spfAuthResult: string | null
  dkimAuthResult: string | null
  dmarcCompliant: boolean
}
interface RecordsResponse {
  records: RecordRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ── URL state + window persistence ────────────────────────────────────────
const route = useRoute()
const router = useRouter()
const { selectedWindow, timeRange, setWindow: _setWindow } = useWindowFilter()

// Records page normalises the ToggleGroup single/array emit before delegating.
function setWindow(w: string | string[]) {
  const val = Array.isArray(w) ? w[0] : w
  if (!val) return
  _setWindow(val, { resetPage: true })
}

const currentPage = computed(() => Number(route.query.page ?? 1))

const sortField = computed<'time' | 'count'>(() =>
  route.query.sort === 'count' ? 'count' : 'time',
)

const sortOrder = computed<'asc' | 'desc'>(() =>
  route.query.order === 'asc' ? 'asc' : 'desc',
)

const activeDispositions = computed<string[]>(() => {
  const d = route.query.disposition
  if (!d) return []
  return String(d).split(',').filter(Boolean)
})

const dkimFilter = computed<string>(() => {
  const v = route.query.dkim as string
  return ['pass', 'fail'].includes(v) ? v : 'all'
})

const spfFilter = computed<string>(() => {
  const v = route.query.spf as string
  return ['pass', 'fail'].includes(v) ? v : 'all'
})

// Client-side text search (filters current page; debounced URL sync)
const ipSearch = ref((route.query.ip as string) ?? '')
const headerFromSearch = ref((route.query.headerFrom as string) ?? '')

function setPage(p: number) {
  router.push({ query: { ...route.query, page: p } })
}

function setSort(field: 'time' | 'count') {
  const newOrder =
    sortField.value === field && sortOrder.value === 'desc' ? 'asc' : 'desc'
  router.push({ query: { ...route.query, sort: field, order: newOrder, page: 1 } })
}

function setDispositions(vals: string | string[]) {
  const arr = Array.isArray(vals) ? vals : vals ? [vals] : []
  const value = arr.join(',') || undefined
  router.push({ query: { ...route.query, disposition: value, page: 1 } })
}

function setDkim(v: string) {
  router.push({ query: { ...route.query, dkim: v === 'all' ? undefined : v, page: 1 } })
}

function setSpf(v: string) {
  router.push({ query: { ...route.query, spf: v === 'all' ? undefined : v, page: 1 } })
}

// Keep URL in sync with text search refs (debounced to avoid a navigation per keystroke)
const syncIpToUrl = useDebounceFn((val: string) => {
  router.replace({ query: { ...route.query, ip: val || undefined, page: 1 } })
}, 300)
const syncHeaderFromToUrl = useDebounceFn((val: string) => {
  router.replace({ query: { ...route.query, headerFrom: val || undefined, page: 1 } })
}, 300)
watch(ipSearch, syncIpToUrl)
watch(headerFromSearch, syncHeaderFromToUrl)

// ── sessionStorage: persist records filters within the tab's lifetime ─────
// window= is deliberately excluded — DB owns that preference.
const SS_KEY = 'records-filters'

interface RecordsFilters {
  sort?: 'time' | 'count'
  order?: 'asc' | 'desc'
  disposition?: string
  dkim?: string
  spf?: string
  ip?: string
  headerFrom?: string
  page?: number
}

// On mount: if the URL carries none of the records-specific params, restore
// from sessionStorage (URL always wins when params are already present).
onMounted(() => {
  const urlHasFilters = route.query.sort || route.query.order || route.query.disposition
    || route.query.dkim || route.query.spf || route.query.ip
    || route.query.headerFrom || route.query.page
  if (urlHasFilters) return

  try {
    const stored = sessionStorage.getItem(SS_KEY)
    if (!stored) return
    const parsed = JSON.parse(stored) as RecordsFilters
    const restored: Record<string, string | number> = {}
    if (parsed.sort) restored.sort = parsed.sort
    if (parsed.order) restored.order = parsed.order
    if (parsed.disposition) restored.disposition = parsed.disposition
    if (parsed.dkim) restored.dkim = parsed.dkim
    if (parsed.spf) restored.spf = parsed.spf
    if (parsed.ip) restored.ip = parsed.ip
    if (parsed.headerFrom) restored.headerFrom = parsed.headerFrom
    // Skip page=1 — restoring the first page is no different from default
    if (parsed.page && parsed.page > 1) restored.page = parsed.page

    if (Object.keys(restored).length > 0) {
      router.replace({ query: { ...route.query, ...restored } })
    }
  }
  catch {
    // sessionStorage unavailable (private mode, quota exceeded) — silently skip.
  }
})

// Mirror current URL state to sessionStorage on every route.query change.
watch(
  () => route.query,
  (q) => {
    try {
      const snapshot: RecordsFilters = {
        sort: q.sort as RecordsFilters['sort'],
        order: q.order as RecordsFilters['order'],
        disposition: q.disposition as string | undefined,
        dkim: q.dkim as string | undefined,
        spf: q.spf as string | undefined,
        ip: q.ip as string | undefined,
        headerFrom: q.headerFrom as string | undefined,
        page: q.page ? Number(q.page) : undefined,
      }
      sessionStorage.setItem(SS_KEY, JSON.stringify(snapshot))
    }
    catch {
      // Silently ignore if sessionStorage is unavailable.
    }
  },
  { deep: true },
)

// ── data fetching ──────────────────────────────────────────────────────────
const recordsKey = computed(() => {
  let key =
    `/api/dashboard/records?from=${timeRange.value.from}&to=${timeRange.value.to}` +
    `&page=${currentPage.value}&sort=${sortField.value}&order=${sortOrder.value}`
  if (activeDispositions.value.length) key += `&disposition=${activeDispositions.value.join(',')}`
  if (dkimFilter.value !== 'all') key += `&dkim=${dkimFilter.value}`
  if (spfFilter.value !== 'all') key += `&spf=${spfFilter.value}`
  return key
})

const {
  data: recordsData,
  status: recordsStatus,
  refresh: refreshRecords,
} = await useFetch<RecordsResponse>(recordsKey, { watch: false, key: recordsKey })

watch([currentPage, sortField, sortOrder, activeDispositions, dkimFilter, spfFilter, selectedWindow], () => {
  refreshRecords()
})

// ── client-side text filtering (current page only) ────────────────────────
// DKIM and SPF are server-side (included in recordsKey → API).
// IP and Header-From are text searches that filter the current page locally
// while the debounced URL sync keeps them bookmarkable.
const filteredRecords = computed(() => {
  const records = recordsData.value?.records ?? []
  const ipQ = ipSearch.value.trim().toLowerCase()
  const hfQ = headerFromSearch.value.trim().toLowerCase()

  return records.filter((r) => {
    if (ipQ && !r.sourceIp.toLowerCase().includes(ipQ)) return false
    if (hfQ && !r.headerFrom.toLowerCase().includes(hfQ)) return false
    return true
  })
})

// ── helpers ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50

const showingFrom = computed(() => {
  if (!recordsData.value) return 0
  return (currentPage.value - 1) * PAGE_SIZE + 1
})

const showingTo = computed(() => {
  if (!recordsData.value) return 0
  return Math.min(currentPage.value * PAGE_SIZE, recordsData.value.total)
})

const SORT_ICON: Record<string, string> = { asc: '↑', desc: '↓' }

const DISPOSITION_BADGE_CLASS: Record<string, string> = {
  none: 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  quarantine: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  reject: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
}

// ── DMARC status classification ────────────────────────────────────────────
// Pass          — DMARC alignment passed (SPF or DKIM)
// Misconfigured — auth passed but alignment failed (relay, wrong domain, forwarding)
// Spoofed       — no auth passed at all; message likely forged
type DmarcStatus = 'pass' | 'misconfigured' | 'spoofed'

function dmarcStatus(r: RecordRow): DmarcStatus {
  if (r.dmarcCompliant) return 'pass'
  const anyAuthPassed = r.dkimAuthResult === 'pass' || r.spfAuthResult === 'pass'
  return anyAuthPassed ? 'misconfigured' : 'spoofed'
}

const STATUS_LABEL: Record<DmarcStatus, string> = {
  pass: 'Pass',
  misconfigured: 'Misconfigured',
  spoofed: 'Spoofed',
}

const STATUS_BADGE_CLASS: Record<DmarcStatus, string> = {
  pass: 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  misconfigured: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  spoofed: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
}

const STATUS_TOOLTIP: Record<DmarcStatus, string> = {
  pass: 'DMARC passed — SPF or DKIM alignment verified',
  misconfigured: 'Misconfigured — authentication passed but alignment failed (wrong domain, relay, or forwarding)',
  spoofed: 'Spoofed — no authentication passed; message likely forged',
}

function resultClass(result: string | null): string {
  if (result === 'pass') return 'text-green-600 dark:text-green-400'
  return 'text-red-600 dark:text-red-400'
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6 p-6">

    <!-- Page heading -->
    <h1 class="text-2xl font-semibold">Records</h1>

    <!-- Filter bar -->
    <div class="flex flex-wrap items-center gap-3">

      <!-- Time range -->
      <ToggleGroup
        type="single"
        variant="outline"
        :model-value="selectedWindow"
        @update:model-value="setWindow($event)"
      >
        <ToggleGroupItem v-for="w in (['24h', '7d', '30d', '90d'] as const)" :key="w" :value="w" class="text-sm">
          {{ w }}
        </ToggleGroupItem>
      </ToggleGroup>

      <Separator orientation="vertical" class="h-7" />

      <!-- Disposition -->
      <ToggleGroup
        type="multiple"
        variant="outline"
        :model-value="activeDispositions"
        @update:model-value="setDispositions($event)"
      >
        <ToggleGroupItem value="none" class="text-sm">none</ToggleGroupItem>
        <ToggleGroupItem value="quarantine" class="text-sm">quarantine</ToggleGroupItem>
        <ToggleGroupItem value="reject" class="text-sm">reject</ToggleGroupItem>
      </ToggleGroup>

      <Separator orientation="vertical" class="h-7" />

      <!-- IP search -->
      <Input
        v-model="ipSearch"
        placeholder="Source IP…"
        class="w-40 h-8 text-sm"
      />

      <!-- Header From search -->
      <Input
        v-model="headerFromSearch"
        placeholder="Header From…"
        class="w-44 h-8 text-sm"
      />

      <!-- DKIM filter -->
      <Select :model-value="dkimFilter" @update:model-value="setDkim($event)">
        <SelectTrigger class="w-32 h-8 text-sm">
          <SelectValue placeholder="DKIM" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">DKIM: all</SelectItem>
          <SelectItem value="pass">DKIM: pass</SelectItem>
          <SelectItem value="fail">DKIM: fail</SelectItem>
        </SelectContent>
      </Select>

      <!-- SPF filter -->
      <Select :model-value="spfFilter" @update:model-value="setSpf($event)">
        <SelectTrigger class="w-32 h-8 text-sm">
          <SelectValue placeholder="SPF" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">SPF: all</SelectItem>
          <SelectItem value="pass">SPF: pass</SelectItem>
          <SelectItem value="fail">SPF: fail</SelectItem>
        </SelectContent>
      </Select>

    </div>

    <!-- Record count line -->
    <p
      v-if="recordsData && recordsStatus === 'success'"
      class="text-muted-foreground text-sm"
    >
      Showing {{ showingFrom }}–{{ showingTo }} of {{ Intl.NumberFormat('en-US').format(recordsData.total) }} records
      <span v-if="filteredRecords.length !== recordsData.records.length">
        ({{ filteredRecords.length }} after filters)
      </span>
    </p>

    <!-- Table -->
    <Card>
      <CardContent class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button variant="ghost" size="sm" class="-ml-2 flex items-center gap-1 font-medium" @click="setSort('time')">
                Timestamp
                <span v-if="sortField === 'time'" class="text-xs opacity-70">{{ SORT_ICON[sortOrder] }}</span>
              </Button>
            </TableHead>
            <TableHead>Source IP</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" class="-ml-2 flex items-center gap-1 font-medium" @click="setSort('count')">
                Count
                <span v-if="sortField === 'count'" class="text-xs opacity-70">{{ SORT_ICON[sortOrder] }}</span>
              </Button>
            </TableHead>
            <TableHead>Disposition</TableHead>
            <TableHead>Header From</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>DKIM</TableHead>
            <TableHead>SPF</TableHead>
            <TableHead class="text-right">Record</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <!-- Loading skeleton -->
          <template v-if="recordsStatus === 'pending'">
            <TableRow v-for="i in 8" :key="i">
              <TableCell><Skeleton class="h-4 w-32" /></TableCell>
              <TableCell><Skeleton class="h-4 w-28" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-10" /></TableCell>
              <TableCell><Skeleton class="h-4 w-20" /></TableCell>
              <TableCell><Skeleton class="h-4 w-36" /></TableCell>
              <TableCell><Skeleton class="h-5 w-24 rounded-full" /></TableCell>
              <TableCell><Skeleton class="h-4 w-10" /></TableCell>
              <TableCell><Skeleton class="h-4 w-10" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
            </TableRow>
          </template>

          <!-- Data rows -->
          <template v-else-if="recordsStatus === 'success' && filteredRecords.length > 0">
            <TableRow v-for="record in filteredRecords" :key="record.id">
              <TableCell class="text-sm tabular-nums">
                {{ new Date(record.dateBegin).toLocaleString('en-US') }}
              </TableCell>
              <TableCell>
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-xs" as-child>
                  <NuxtLink :to="`/ips/${record.sourceIp}`">{{ record.sourceIp }}</NuxtLink>
                </Button>
              </TableCell>
              <TableCell class="text-sm">{{ record.country ?? '—' }}</TableCell>
              <TableCell class="text-right text-sm tabular-nums">
                {{ Intl.NumberFormat('en-US').format(record.count) }}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  :class="DISPOSITION_BADGE_CLASS[record.disposition] ?? 'text-muted-foreground'"
                >
                  {{ record.disposition }}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-xs" as-child>
                  <NuxtLink :to="`/domains/${record.headerFrom}`">{{ record.headerFrom }}</NuxtLink>
                </Button>
              </TableCell>
              <!-- DMARC status: Pass / Misconfigured / Spoofed -->
              <TableCell>
                <Badge
                  variant="outline"
                  :class="STATUS_BADGE_CLASS[dmarcStatus(record)]"
                  :title="STATUS_TOOLTIP[dmarcStatus(record)]"
                >
                  {{ STATUS_LABEL[dmarcStatus(record)] }}
                </Badge>
              </TableCell>
              <!-- DKIM alignment verdict -->
              <TableCell>
                <span
                  :class="['text-xs font-medium', resultClass(record.dkim)]"
                  title="DKIM alignment verdict (DMARC evaluated)"
                >{{ record.dkim }}</span>
              </TableCell>
              <!-- SPF alignment verdict -->
              <TableCell>
                <span
                  :class="['text-xs font-medium', resultClass(record.spf)]"
                  title="SPF alignment verdict (DMARC evaluated)"
                >{{ record.spf }}</span>
              </TableCell>
              <TableCell class="text-right">
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-[11px] text-muted-foreground hover:text-foreground" as-child>
                  <NuxtLink :to="`/records/${record.id}`">{{ record.id.slice(0, 8) }} →</NuxtLink>
                </Button>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
      </CardContent>
    </Card>

    <!-- Empty state -->
    <Card
      v-if="recordsStatus === 'success' && filteredRecords.length === 0"
      class="py-16"
    >
      <CardContent class="flex flex-col items-center gap-2 p-0 text-center">
        <p class="text-muted-foreground text-sm">No records match your current filters.</p>
        <p class="text-muted-foreground text-xs">Try adjusting the time range or clearing filters.</p>
      </CardContent>
    </Card>

    <!-- Pagination -->
    <div
      v-if="recordsData && recordsData.totalPages > 1"
      class="flex items-center justify-between"
    >
      <p class="text-muted-foreground text-sm">
        Page {{ currentPage }} of {{ recordsData.totalPages }}
      </p>

      <Pagination
        :total="recordsData.total"
        :items-per-page="PAGE_SIZE"
        :page="currentPage"
        :sibling-count="1"
        show-edges
        @update:page="setPage"
      >
        <PaginationContent v-slot="{ items }">
          <!-- Nav buttons must NOT be wrapped in PaginationItem (which requires a numeric value) -->
          <PaginationFirst @click="setPage(1)" />
          <PaginationPrevious @click="setPage(Math.max(1, currentPage - 1))" />

          <template v-for="item in items" :key="item.type === 'page' ? item.value : `ellipsis-${item.type}`">
            <!-- PaginationItem wraps reka-ui's PaginationListItem and requires :value -->
            <PaginationItem v-if="item.type === 'page'" :value="item.value">
              <PaginationLink
                :is-active="item.value === currentPage"
                @click="setPage(item.value)"
              >
                {{ item.value }}
              </PaginationLink>
            </PaginationItem>
            <PaginationEllipsis v-else />
          </template>

          <PaginationNext @click="setPage(Math.min(recordsData.totalPages, currentPage + 1))" />
          <PaginationLast @click="setPage(recordsData.totalPages)" />
        </PaginationContent>
      </Pagination>
    </div>

  </div>
</template>
