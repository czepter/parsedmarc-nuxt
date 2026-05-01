<script setup lang="ts">
// ── types ─────────────────────────────────────────────────────────────────
interface TileData {
  totalMessages: number
  passRate: number
  topSourceIp: string | null
  topCountry: string | null
  distinctIps: number
}
interface StatsResponse {
  current: TileData
  previous: TileData
  window: { from: number; to: number }
}
interface TimeseriesResponse {
  granularity: string
  timestamps: number[]
  none: number[]
  quarantine: number[]
  reject: number[]
}
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

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

const timeRange = computed(() => {
  const to = nowSeconds()
  const from = to - WINDOWS[selectedWindow.value]
  return { from, to }
})

// ── navigate helpers ───────────────────────────────────────────────────────
function setWindow(w: WindowKey) {
  router.push({ query: { ...route.query, window: w, page: 1 } })
}

function setPage(p: number) {
  router.push({ query: { ...route.query, page: p } })
}

function setSort(field: 'time' | 'count') {
  const newOrder =
    sortField.value === field && sortOrder.value === 'desc' ? 'asc' : 'desc'
  router.push({ query: { ...route.query, sort: field, order: newOrder, page: 1 } })
}

function toggleDisposition(d: string) {
  const current = new Set(activeDispositions.value)
  if (current.has(d)) current.delete(d)
  else current.add(d)
  const value = Array.from(current).join(',') || undefined
  router.push({ query: { ...route.query, disposition: value, page: 1 } })
}

// ── data fetching ──────────────────────────────────────────────────────────
const statsKey = computed(
  () => `/api/dashboard/stats?from=${timeRange.value.from}&to=${timeRange.value.to}`,
)
const timeseriesKey = computed(
  () => `/api/dashboard/timeseries?from=${timeRange.value.from}&to=${timeRange.value.to}`,
)
const recordsKey = computed(
  () =>
    `/api/dashboard/records?from=${timeRange.value.from}&to=${timeRange.value.to}` +
    `&page=${currentPage.value}&sort=${sortField.value}&order=${sortOrder.value}` +
    (activeDispositions.value.length ? `&disposition=${activeDispositions.value.join(',')}` : ''),
)

const { data: stats, status: statsStatus, refresh: refreshStats } = await useFetch<StatsResponse>(
  statsKey,
  { watch: false, key: statsKey },
)
const {
  data: timeseries,
  status: timeseriesStatus,
  refresh: refreshTimeseries,
} = await useFetch<TimeseriesResponse>(timeseriesKey, { watch: false, key: timeseriesKey })
const {
  data: recordsData,
  status: recordsStatus,
  refresh: refreshRecords,
} = await useFetch<RecordsResponse>(recordsKey, { watch: false, key: recordsKey })

watch(selectedWindow, () => {
  refreshStats()
  refreshTimeseries()
  refreshRecords()
})

watch([currentPage, sortField, sortOrder, activeDispositions], () => {
  refreshRecords()
})

// ── helpers ────────────────────────────────────────────────────────────────
function fmtDelta(current: number, previous: number, unit = ''): string {
  if (previous === 0) return '—'
  const diff = current - previous
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(unit === 'pp' ? 1 : 0)}${unit} vs prior`
}

function fmtNumber(n: number): string {
  return n.toLocaleString()
}

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

const DISPOSITION_COLORS: Record<string, string> = {
  none: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
  quarantine: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
  reject: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
}

function dispositionClass(d: string): string {
  return DISPOSITION_COLORS[d] ?? 'text-muted-foreground bg-muted border-border'
}

const SORT_ICON: Record<string, string> = { asc: '↑', desc: '↓' }
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8 p-6">

    <!-- Header row -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Dashboard</h1>
      <div class="flex gap-1 rounded-md border p-1">
        <button
          v-for="w in (['24h', '7d', '30d', '90d'] as const)"
          :key="w"
          :class="[
            'rounded px-3 py-1 text-sm font-medium transition-colors',
            selectedWindow === w
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="setWindow(w)"
        >
          {{ w }}
        </button>
      </div>
    </div>

    <!-- Summary tiles -->
    <div
      v-if="statsStatus === 'success' && stats"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
    >
      <Card class="p-4">
        <CardContent class="p-0 space-y-1">
          <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Total Messages</p>
          <p class="text-2xl font-bold">{{ fmtNumber(stats.current.totalMessages) }}</p>
          <p class="text-muted-foreground text-xs">{{ fmtDelta(stats.current.totalMessages, stats.previous.totalMessages) }}</p>
        </CardContent>
      </Card>

      <Card class="p-4">
        <CardContent class="p-0 space-y-1">
          <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">DMARC Pass Rate</p>
          <p class="text-2xl font-bold">{{ fmtPercent(stats.current.passRate) }}</p>
          <p class="text-muted-foreground text-xs">{{ fmtDelta(stats.current.passRate, stats.previous.passRate, 'pp') }}</p>
        </CardContent>
      </Card>

      <Card class="p-4">
        <CardContent class="p-0 space-y-1">
          <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Top Source IP</p>
          <p class="truncate font-mono text-lg font-bold">{{ stats.current.topSourceIp ?? '—' }}</p>
          <p class="text-muted-foreground text-xs">by message count</p>
        </CardContent>
      </Card>

      <Card class="p-4">
        <CardContent class="p-0 space-y-1">
          <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Top Country</p>
          <p class="text-2xl font-bold">{{ stats.current.topCountry ?? '—' }}</p>
          <p class="text-muted-foreground text-xs">by message count</p>
        </CardContent>
      </Card>

      <Card class="p-4">
        <CardContent class="p-0 space-y-1">
          <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Distinct IPs</p>
          <p class="text-2xl font-bold">{{ fmtNumber(stats.current.distinctIps) }}</p>
          <p class="text-muted-foreground text-xs">{{ fmtDelta(stats.current.distinctIps, stats.previous.distinctIps) }}</p>
        </CardContent>
      </Card>
    </div>

    <!-- Tiles skeleton -->
    <div
      v-else-if="statsStatus === 'pending'"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
    >
      <Card v-for="i in 5" :key="i" class="h-24 animate-pulse bg-muted p-4" />
    </div>

    <!-- Hero chart -->
    <Card class="p-4">
      <CardContent class="p-0">
        <p class="text-muted-foreground mb-3 text-sm font-medium">
          Message Volume
          <span v-if="timeseries" class="ml-1">(per {{ timeseries.granularity }})</span>
        </p>
        <div aria-hidden="true">
          <ClientOnly>
            <TimeSeries
              v-if="timeseries && timeseries.timestamps.length > 0"
              :timestamps="timeseries.timestamps"
              :none="timeseries.none"
              :quarantine="timeseries.quarantine"
              :reject="timeseries.reject"
              :height="300"
            />
            <div
              v-else-if="timeseriesStatus === 'pending'"
              class="bg-muted h-[300px] animate-pulse rounded-md"
            />
            <div
              v-else
              class="text-muted-foreground flex h-[300px] items-center justify-center text-sm"
            >
              No data for this time window.
            </div>
          </ClientOnly>
        </div>
        <details class="mt-2">
          <summary class="text-muted-foreground cursor-pointer text-xs underline">
            View as data table
          </summary>
          <div class="mt-2 overflow-auto">
            <table class="text-xs" v-if="timeseries">
              <thead>
                <tr>
                  <th class="pr-4 text-left">Bucket</th>
                  <th class="pr-4 text-right">Pass</th>
                  <th class="pr-4 text-right">Quarantine</th>
                  <th class="text-right">Reject</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(ts, i) in timeseries.timestamps" :key="ts">
                  <td class="pr-4">{{ new Date(ts * 1000).toLocaleString() }}</td>
                  <td class="pr-4 text-right">{{ timeseries.none[i] }}</td>
                  <td class="pr-4 text-right">{{ timeseries.quarantine[i] }}</td>
                  <td class="text-right">{{ timeseries.reject[i] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>

    <!-- Records table -->
    <div class="space-y-3">
      <!-- Filter row -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground text-sm">Disposition:</span>
        <button
          v-for="d in ['none', 'quarantine', 'reject']"
          :key="d"
          :class="[
            'rounded-full border px-3 py-0.5 text-xs font-medium transition-colors',
            activeDispositions.includes(d)
              ? dispositionClass(d)
              : 'text-muted-foreground border-border hover:text-foreground',
          ]"
          @click="toggleDisposition(d)"
        >
          {{ d }}
        </button>
        <button
          v-if="activeDispositions.length > 0"
          class="text-muted-foreground text-xs underline"
          @click="router.push({ query: { ...route.query, disposition: undefined, page: 1 } })"
        >
          Clear
        </button>
      </div>

      <!-- Table -->
      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button class="flex items-center gap-1" @click="setSort('time')">
                  Timestamp
                  <span v-if="sortField === 'time'" class="text-xs">{{ SORT_ICON[sortOrder] }}</span>
                </button>
              </TableHead>
              <TableHead>Source IP</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>
                <button class="flex items-center gap-1" @click="setSort('count')">
                  Count
                  <span v-if="sortField === 'count'" class="text-xs">{{ SORT_ICON[sortOrder] }}</span>
                </button>
              </TableHead>
              <TableHead>Disposition</TableHead>
              <TableHead>Header From</TableHead>
              <TableHead>DKIM</TableHead>
              <TableHead>SPF</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <template v-if="recordsStatus === 'success' && recordsData">
              <TableRow v-for="record in recordsData.records" :key="record.id">
                <TableCell class="text-sm">{{ new Date(record.dateBegin).toLocaleString() }}</TableCell>
                <TableCell>
                  <Button variant="link" size="sm" class="h-auto p-0 font-mono text-xs" as-child>
                    <NuxtLink :to="`/ips/${record.sourceIp}`">{{ record.sourceIp }}</NuxtLink>
                  </Button>
                </TableCell>
                <TableCell class="text-sm">{{ record.country ?? '—' }}</TableCell>
                <TableCell class="text-right text-sm">{{ record.count.toLocaleString() }}</TableCell>
                <TableCell>
                  <span :class="['inline-block rounded-full border px-2 py-0.5 text-xs font-medium', dispositionClass(record.disposition)]">
                    {{ record.disposition }}
                  </span>
                </TableCell>
                <TableCell class="font-mono text-xs">{{ record.headerFrom }}</TableCell>
                <TableCell>
                  <span :class="record.dkim === 'pass' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'" class="text-xs font-medium">
                    {{ record.dkim }}
                  </span>
                </TableCell>
                <TableCell>
                  <span :class="record.spf === 'pass' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'" class="text-xs font-medium">
                    {{ record.spf }}
                  </span>
                </TableCell>
              </TableRow>

              <TableRow v-if="recordsData.records.length === 0">
                <TableCell colspan="8" class="text-muted-foreground py-12 text-center text-sm">
                  No records for this time window.
                </TableCell>
              </TableRow>
            </template>

            <TableRow v-else-if="recordsStatus === 'pending'">
              <TableCell colspan="8" class="text-muted-foreground py-12 text-center text-sm">
                Loading…
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination -->
      <div
        v-if="recordsData && recordsData.totalPages > 1"
        class="flex items-center justify-between text-sm"
      >
        <p class="text-muted-foreground">
          Showing {{ ((currentPage - 1) * 50) + 1 }}–{{ Math.min(currentPage * 50, recordsData.total) }}
          of {{ recordsData.total.toLocaleString() }} records
        </p>
        <div class="flex gap-1">
          <Button variant="outline" size="sm" :disabled="currentPage <= 1" @click="setPage(currentPage - 1)">
            Previous
          </Button>
          <Button variant="outline" size="sm" :disabled="currentPage >= recordsData.totalPages" @click="setPage(currentPage + 1)">
            Next
          </Button>
        </div>
      </div>
    </div>

  </div>
</template>
