<script setup lang="ts">
definePageMeta({ layout: 'default' })
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

// ── data fetching ──────────────────────────────────────────────────────────
const statsKey = computed(
  () => `/api/dashboard/stats?from=${timeRange.value.from}&to=${timeRange.value.to}`,
)
const timeseriesKey = computed(
  () => `/api/dashboard/timeseries?from=${timeRange.value.from}&to=${timeRange.value.to}`,
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

watch(selectedWindow, () => {
  refreshStats()
  refreshTimeseries()
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

    <!-- View all records -->
    <div class="flex justify-end">
      <Button variant="outline" as-child>
        <NuxtLink to="/records">View all records →</NuxtLink>
      </Button>
    </div>

  </div>
</template>
