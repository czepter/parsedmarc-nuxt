<script setup lang="ts">
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
}
interface RecordsResponse {
  records: RecordRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ── URL state ──────────────────────────────────────────────────────────────
const route = useRoute()
const router = useRouter()

type WindowKey = '24h' | '7d' | '30d' | '90d'
const WINDOWS: Record<WindowKey, number> = {
  '24h': 86400,
  '7d': 7 * 86400,
  '30d': 30 * 86400,
  '90d': 90 * 86400,
}

const selectedWindow = computed<WindowKey>(() => {
  const w = route.query.window as string
  return (Object.keys(WINDOWS) as WindowKey[]).includes(w as WindowKey)
    ? (w as WindowKey)
    : '7d'
})

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

// Client-side search fields (not sent to API)
const ipSearch = ref((route.query.ip as string) ?? '')
const headerFromSearch = ref((route.query.headerFrom as string) ?? '')

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

const timeRange = computed(() => {
  const to = nowSeconds()
  const from = to - WINDOWS[selectedWindow.value]
  return { from, to }
})

// ── navigate helpers ───────────────────────────────────────────────────────
function setWindow(w: WindowKey | WindowKey[]) {
  // ToggleGroup single emits a string or array; normalise
  const val = Array.isArray(w) ? w[0] : w
  if (!val) return
  router.push({ query: { ...route.query, window: val, page: 1 } })
}

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

// Keep URL in sync with local search refs (debounced via watch)
watch(ipSearch, (val) => {
  router.replace({ query: { ...route.query, ip: val || undefined, page: 1 } })
})
watch(headerFromSearch, (val) => {
  router.replace({ query: { ...route.query, headerFrom: val || undefined, page: 1 } })
})

// ── data fetching ──────────────────────────────────────────────────────────
const recordsKey = computed(
  () =>
    `/api/dashboard/records?from=${timeRange.value.from}&to=${timeRange.value.to}` +
    `&page=${currentPage.value}&sort=${sortField.value}&order=${sortOrder.value}` +
    (activeDispositions.value.length ? `&disposition=${activeDispositions.value.join(',')}` : ''),
)

const {
  data: recordsData,
  status: recordsStatus,
  refresh: refreshRecords,
} = await useFetch<RecordsResponse>(recordsKey, { watch: false, key: recordsKey })

watch([currentPage, sortField, sortOrder, activeDispositions, selectedWindow], () => {
  refreshRecords()
})

// ── client-side filtering ─────────────────────────────────────────────────
const filteredRecords = computed(() => {
  const records = recordsData.value?.records ?? []
  const ipQ = ipSearch.value.trim().toLowerCase()
  const hfQ = headerFromSearch.value.trim().toLowerCase()
  const dk = dkimFilter.value
  const sp = spfFilter.value

  return records.filter((r) => {
    if (ipQ && !r.sourceIp.toLowerCase().includes(ipQ)) return false
    if (hfQ && !r.headerFrom.toLowerCase().includes(hfQ)) return false
    if (dk !== 'all' && r.dkim !== dk) return false
    if (sp !== 'all' && r.spf !== sp) return false
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
        @update:model-value="setWindow($event as WindowKey)"
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
      Showing {{ showingFrom }}–{{ showingTo }} of {{ recordsData.total.toLocaleString() }} records
      <span v-if="filteredRecords.length !== recordsData.records.length">
        ({{ filteredRecords.length }} after filters)
      </span>
    </p>

    <!-- Table -->
    <div class="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button class="flex items-center gap-1 font-medium" @click="setSort('time')">
                Timestamp
                <span v-if="sortField === 'time'" class="text-xs opacity-70">{{ SORT_ICON[sortOrder] }}</span>
              </button>
            </TableHead>
            <TableHead>Source IP</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>
              <button class="flex items-center gap-1 font-medium" @click="setSort('count')">
                Count
                <span v-if="sortField === 'count'" class="text-xs opacity-70">{{ SORT_ICON[sortOrder] }}</span>
              </button>
            </TableHead>
            <TableHead>Disposition</TableHead>
            <TableHead>Header From</TableHead>
            <TableHead>DKIM</TableHead>
            <TableHead>SPF</TableHead>
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
              <TableCell><Skeleton class="h-4 w-10" /></TableCell>
              <TableCell><Skeleton class="h-4 w-10" /></TableCell>
            </TableRow>
          </template>

          <!-- Data rows -->
          <template v-else-if="recordsStatus === 'success' && filteredRecords.length > 0">
            <TableRow v-for="record in filteredRecords" :key="record.id">
              <TableCell class="text-sm tabular-nums">
                {{ new Date(record.dateBegin).toLocaleString() }}
              </TableCell>
              <TableCell>
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-xs" as-child>
                  <NuxtLink :to="`/ips/${record.sourceIp}`">{{ record.sourceIp }}</NuxtLink>
                </Button>
              </TableCell>
              <TableCell class="text-sm">{{ record.country ?? '—' }}</TableCell>
              <TableCell class="text-right text-sm tabular-nums">
                {{ record.count.toLocaleString() }}
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
              <TableCell>
                <span
                  :class="record.dkim === 'pass'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'"
                  class="text-xs font-medium"
                >
                  {{ record.dkim }}
                </span>
              </TableCell>
              <TableCell>
                <span
                  :class="record.spf === 'pass'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'"
                  class="text-xs font-medium"
                >
                  {{ record.spf }}
                </span>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

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
          <PaginationItem>
            <PaginationFirst @click="setPage(1)" />
          </PaginationItem>
          <PaginationItem>
            <PaginationPrevious @click="setPage(Math.max(1, currentPage - 1))" />
          </PaginationItem>

          <template v-for="item in items" :key="item.type === 'page' ? item.value : `ellipsis-${item.type}`">
            <PaginationItem v-if="item.type === 'page'">
              <PaginationLink
                :is-active="item.value === currentPage"
                @click="setPage(item.value)"
              >
                {{ item.value }}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem v-else>
              <PaginationEllipsis />
            </PaginationItem>
          </template>

          <PaginationItem>
            <PaginationNext @click="setPage(Math.min(recordsData.totalPages, currentPage + 1))" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLast @click="setPage(recordsData.totalPages)" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>

  </div>
</template>
