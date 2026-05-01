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
interface CountryItem { code: string | null; name: string | null; count: number; share: number }
interface SourceIpItem { ip: string; country: string | null; count: number; share: number; passRate: number }
interface HeaderFromItem { domain: string; count: number; share: number; passRate: number }
interface AuthDimension { pass: number; fail: number; total: number }
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

const countriesKey = computed(() => `/api/dashboard/countries?from=${timeRange.value.from}&to=${timeRange.value.to}`)
const sourceIpsKey = computed(() => `/api/dashboard/source-ips?from=${timeRange.value.from}&to=${timeRange.value.to}`)
const headerFromKey = computed(() => `/api/dashboard/header-from?from=${timeRange.value.from}&to=${timeRange.value.to}`)
const authKey = computed(() => `/api/dashboard/auth?from=${timeRange.value.from}&to=${timeRange.value.to}`)

const { data: countriesData, status: countriesStatus, refresh: refreshCountries } = await useFetch<{ countries: CountryItem[] }>(countriesKey, { watch: false, key: countriesKey })
const { data: sourceIpsData, status: sourceIpsStatus, refresh: refreshSourceIps } = await useFetch<{ ips: SourceIpItem[] }>(sourceIpsKey, { watch: false, key: sourceIpsKey })
const { data: headerFromData, status: headerFromStatus, refresh: refreshHeaderFrom } = await useFetch<{ domains: HeaderFromItem[] }>(headerFromKey, { watch: false, key: headerFromKey })
const { data: authData, status: authStatus, refresh: refreshAuth } = await useFetch<{ dkim: AuthDimension; spf: AuthDimension }>(authKey, { watch: false, key: authKey })

const heatmapKey = computed(() => `/api/dashboard/heatmap?from=${timeRange.value.from}&to=${timeRange.value.to}`)
const { data: heatmapData, status: heatmapStatus, refresh: refreshHeatmap } = await useFetch<{ matrix: number[][] }>(heatmapKey, { watch: false, key: heatmapKey })

watch(selectedWindow, () => {
  refreshStats()
  refreshTimeseries()
  refreshCountries()
  refreshSourceIps()
  refreshHeaderFrom()
  refreshAuth()
  refreshHeatmap()
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

// ── country flag helper ────────────────────────────────────────────────────
const COUNTRY_CODE_MAP: Record<string, string> = {
  'United States': 'US', 'Germany': 'DE', 'France': 'FR', 'United Kingdom': 'GB',
  'Netherlands': 'NL', 'Russia': 'RU', 'China': 'CN', 'Japan': 'JP',
  'Canada': 'CA', 'Australia': 'AU', 'Brazil': 'BR', 'India': 'IN',
  'South Korea': 'KR', 'Italy': 'IT', 'Spain': 'ES', 'Poland': 'PL',
  'Sweden': 'SE', 'Switzerland': 'CH', 'Czech Republic': 'CZ', 'Austria': 'AT',
  'Belgium': 'BE', 'Denmark': 'DK', 'Finland': 'FI', 'Norway': 'NO',
  'Portugal': 'PT', 'Singapore': 'SG', 'Hong Kong': 'HK', 'Taiwan': 'TW',
  'Mexico': 'MX', 'Argentina': 'AR', 'South Africa': 'ZA', 'Turkey': 'TR',
  'Ukraine': 'UA', 'Romania': 'RO', 'Hungary': 'HU', 'Bulgaria': 'BG',
  'Greece': 'GR', 'Israel': 'IL', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE',
  'Indonesia': 'ID', 'Thailand': 'TH', 'Vietnam': 'VN', 'Malaysia': 'MY',
  'Philippines': 'PH', 'New Zealand': 'NZ', 'Ireland': 'IE', 'Slovakia': 'SK',
}

function countryFlag(name: string): string | undefined {
  const code = COUNTRY_CODE_MAP[name]
  if (!code) return undefined
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65),
  )
}

const tableOpen = ref(false)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8 p-6">

    <!-- Header row -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Dashboard</h1>
      <ToggleGroup
        type="single"
        :model-value="selectedWindow"
        variant="outline"
        @update:model-value="v => v && setWindow(v as WindowKey)"
      >
        <ToggleGroupItem
          v-for="w in (['24h', '7d', '30d', '90d'] as const)"
          :key="w"
          :value="w"
          class="px-3 py-1 text-sm"
        >{{ w }}</ToggleGroupItem>
      </ToggleGroup>
    </div>

    <!-- Summary tiles -->
    <div
      v-if="statsStatus === 'success' && stats"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
    >
      <StatCard
        label="Total Messages"
        :value="fmtNumber(stats.current.totalMessages)"
        :delta="fmtDelta(stats.current.totalMessages, stats.previous.totalMessages)"
      />
      <StatCard
        label="DMARC Pass Rate"
        :value="fmtPercent(stats.current.passRate)"
        :delta="fmtDelta(stats.current.passRate, stats.previous.passRate, 'pp')"
      />
      <StatCard
        label="Top Source IP"
        :value="stats.current.topSourceIp ?? '—'"
        subtitle="by message count"
        :mono="true"
      />
      <StatCard
        label="Top Country"
        :value="stats.current.topCountry ?? '—'"
        subtitle="by message count"
      />
      <StatCard
        label="Distinct IPs"
        :value="fmtNumber(stats.current.distinctIps)"
        :delta="fmtDelta(stats.current.distinctIps, stats.previous.distinctIps)"
      />
    </div>

    <!-- Tiles skeleton -->
    <div
      v-else-if="statsStatus === 'pending'"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
    >
      <StatCard v-for="i in 5" :key="i" :loading="true" label="" value="" />
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
            <Skeleton v-else-if="timeseriesStatus === 'pending'" class="h-[300px] w-full rounded-md" />
            <div
              v-else
              class="text-muted-foreground flex h-[300px] items-center justify-center text-sm"
            >
              No data for this time window.
            </div>
          </ClientOnly>
        </div>
        <Collapsible v-model:open="tableOpen" class="mt-2">
          <CollapsibleTrigger as-child>
            <Button variant="ghost" size="sm" class="text-xs text-muted-foreground px-0">
              View as data table
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>

    <!-- Breakdown Row 1 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- Top Source IPs -->
      <SectionCard title="Top Source IPs" subtitle="by message count">
        <TopList
          :loading="sourceIpsStatus === 'pending'"
          :items="(sourceIpsData?.ips ?? []).map(ip => ({
            label: ip.ip,
            sublabel: ip.country ?? undefined,
            count: ip.count,
            share: ip.share,
            href: `/ips/${encodeURIComponent(ip.ip)}`,
          }))"
        />
      </SectionCard>

      <!-- Top From Domains -->
      <SectionCard title="Top From Domains" subtitle="by message count">
        <TopList
          :loading="headerFromStatus === 'pending'"
          :items="(headerFromData?.domains ?? []).map(d => ({
            label: d.domain,
            count: d.count,
            share: d.share,
            href: `/domains/${encodeURIComponent(d.domain)}`,
          }))"
        />
      </SectionCard>
    </div>

    <!-- Breakdown Row 2 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- Authentication -->
      <SectionCard title="Authentication" subtitle="DKIM & SPF results">
        <AuthBreakdown
          v-if="authStatus === 'success' && authData"
          :dkim="authData.dkim"
          :spf="authData.spf"
        />
        <AuthBreakdown v-else :loading="true" :dkim="{ pass: 0, fail: 0, total: 0 }" :spf="{ pass: 0, fail: 0, total: 0 }" />
      </SectionCard>

      <!-- Top Countries -->
      <SectionCard title="Top Countries" subtitle="by message count">
        <TopList
          :loading="countriesStatus === 'pending'"
          :items="(countriesData?.countries ?? []).map(c => ({
            label: c.name ?? 'Unknown',
            count: c.count,
            share: c.share,
            flag: c.name ? countryFlag(c.name) : undefined,
          }))"
        />
      </SectionCard>
    </div>

    <!-- Visual Row: World Map + Activity Heatmap -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Geographic Distribution" subtitle="messages by country">
        <ClientOnly>
          <WorldMap
            v-if="countriesStatus === 'success' && countriesData"
            :countries="countriesData.countries.map(c => ({ name: c.name, count: c.count, share: c.share }))"
          />
          <Skeleton v-else class="h-[200px] w-full rounded-md" />
        </ClientOnly>
      </SectionCard>

      <SectionCard title="Activity Heatmap" subtitle="messages by weekday &amp; hour">
        <ClientOnly>
          <HeatMap
            v-if="heatmapStatus === 'success' && heatmapData"
            :matrix="heatmapData.matrix"
          />
          <Skeleton v-else class="h-[140px] w-full rounded-md" />
        </ClientOnly>
      </SectionCard>
    </div>

    <!-- View all records -->
    <div class="flex justify-end">
      <Button variant="outline" as-child>
        <NuxtLink to="/records">View all records →</NuxtLink>
      </Button>
    </div>

  </div>
</template>
