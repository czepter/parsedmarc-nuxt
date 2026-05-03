<script setup lang="ts">
import { ChevronDown, Check } from 'lucide-vue-next'
import type { WindowKey } from '~/types/preferences'

useHead({ title: 'Dashboard — parsedmarc' })

definePageMeta({ layout: 'default' })
// ── types ─────────────────────────────────────────────────────────────────
interface TileData {
  totalMessages: number
  passRate: number
  misconfiguredRate: number
  spoofedRate: number
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
interface ReportingOrgItem { orgName: string; count: number; share: number }
interface AuthCategory { count: number; pct: number }
interface AuthResponse { pass: AuthCategory; misconfigured: AuthCategory; spoofed: AuthCategory; total: number }
// ── URL state + window persistence ────────────────────────────────────────
const route = useRoute()
const { selectedWindow, timeRange, setWindow, QUICK_WINDOWS, MORE_WINDOW_LABELS } = useWindowFilter()

const moreDialogOpen = ref(false)
const isMoreActive = computed(() => !QUICK_WINDOWS.includes(selectedWindow.value))
const moreLabel = computed(() => MORE_WINDOW_LABELS[selectedWindow.value] ?? 'More')

function handleMoreApply(window: WindowKey, from?: number, to?: number) {
  setWindow(window, { from, to })
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
const reportingOrgsKey = computed(() => `/api/dashboard/reporting-orgs?from=${timeRange.value.from}&to=${timeRange.value.to}`)
const authKey = computed(() => `/api/dashboard/auth?from=${timeRange.value.from}&to=${timeRange.value.to}`)

const { data: countriesData, status: countriesStatus, refresh: refreshCountries } = await useFetch<{ countries: CountryItem[] }>(countriesKey, { watch: false, key: countriesKey })
const { data: sourceIpsData, status: sourceIpsStatus, refresh: refreshSourceIps } = await useFetch<{ ips: SourceIpItem[] }>(sourceIpsKey, { watch: false, key: sourceIpsKey })
const { data: headerFromData, status: headerFromStatus, refresh: refreshHeaderFrom } = await useFetch<{ domains: HeaderFromItem[] }>(headerFromKey, { watch: false, key: headerFromKey })
const { data: reportingOrgsData, status: reportingOrgsStatus, refresh: refreshReportingOrgs } = await useFetch<{ orgs: ReportingOrgItem[] }>(reportingOrgsKey, { watch: false, key: reportingOrgsKey })
const { data: authData, status: authStatus, refresh: refreshAuth } = await useFetch<AuthResponse>(authKey, { watch: false, key: authKey })

const heatmapKey = computed(() => `/api/dashboard/heatmap?from=${timeRange.value.from}&to=${timeRange.value.to}`)
const { data: heatmapData, status: heatmapStatus, refresh: refreshHeatmap } = await useFetch<{ entries: Array<{ date: string; dow: number; total: number }> }>(heatmapKey, { watch: false, key: heatmapKey })

watch(selectedWindow, () => {
  refreshStats()
  refreshTimeseries()
  refreshCountries()
  refreshSourceIps()
  refreshHeaderFrom()
  refreshReportingOrgs()
  refreshAuth()
  refreshHeatmap()
})

// ── combined Orgs/IPs card toggle ──────────────────────────────────────────
type SourceView = 'orgs' | 'ips'
const sourceView = ref<SourceView>('orgs')

const sourceTitle = computed(() =>
  sourceView.value === 'orgs' ? 'Top Reporting Organizations' : 'Top Source IPs',
)
const sourceSubtitle = computed(() => 'by message count')
const sourceLoading = computed(() =>
  sourceView.value === 'orgs'
    ? reportingOrgsStatus.value === 'pending'
    : sourceIpsStatus.value === 'pending',
)
const sourceItems = computed(() => {
  if (sourceView.value === 'orgs') {
    return (reportingOrgsData.value?.orgs ?? []).map(o => ({
      label: o.orgName,
      count: o.count,
      share: o.share,
    }))
  }
  return (sourceIpsData.value?.ips ?? []).map(ip => ({
    label: ip.ip,
    sublabel: ip.country ?? undefined,
    count: ip.count,
    share: ip.share,
    href: `/ips/${encodeURIComponent(ip.ip)}`,
  }))
})

// ── helpers ────────────────────────────────────────────────────────────────
function fmtDelta(current: number, previous: number, unit = ''): string {
  if (previous === 0) return '—'
  const diff = current - previous
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(unit === 'pts' ? 1 : 0)}${unit}`
}

function fmtNumber(n: number): string {
  return Intl.NumberFormat('en-US').format(n)
}

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

// countryName() and countryFlag() are auto-imported from app/utils/countryNames.ts

</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8 p-6">

    <!-- Header row -->
    <PageHeader title="Dashboard">
      <template #right>
        <div class="flex items-center">
          <ToggleGroup
            type="single"
            :model-value="isMoreActive ? '' : selectedWindow"
            variant="outline"
            class="rounded-r-none"
            @update:model-value="v => v && setWindow(v as WindowKey)"
          >
            <ToggleGroupItem
              v-for="w in QUICK_WINDOWS"
              :key="w"
              :value="w"
              class="px-3 py-1 text-sm"
            >{{ w }}</ToggleGroupItem>
          </ToggleGroup>

          <!-- More button — active state matches selected ToggleGroupItem style -->
          <Button
            variant="outline"
            :class="[
              'border-l-0 rounded-l-none h-9 px-3 py-1 text-sm gap-1.5',
              isMoreActive ? 'bg-foreground text-background border-foreground hover:bg-foreground/90' : '',
            ]"
            @click="moreDialogOpen = true"
          >
            More <ChevronDown class="size-3" />
          </Button>
        </div>
      </template>
    </PageHeader>

    <DateRangeDialog
      :open="moreDialogOpen"
      :current-window="selectedWindow"
      :current-from="selectedWindow === 'custom' ? timeRange.from : undefined"
      :current-to="selectedWindow === 'custom' ? timeRange.to : undefined"
      @update:open="moreDialogOpen = $event"
      @apply="handleMoreApply"
    />

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
        label="Pass"
        :value="fmtPercent(stats.current.passRate)"
        :delta="fmtDelta(stats.current.passRate, stats.previous.passRate, 'pts')"
        subtitle="DMARC alignment passed"
      />
      <StatCard
        label="Misconfigured"
        :value="fmtPercent(stats.current.misconfiguredRate)"
        :delta="fmtDelta(stats.current.misconfiguredRate, stats.previous.misconfiguredRate, 'pts')"
        subtitle="Auth passed, alignment failed"
        :inverted="true"
      />
      <StatCard
        label="Spoofed"
        :value="fmtPercent(stats.current.spoofedRate)"
        :delta="fmtDelta(stats.current.spoofedRate, stats.previous.spoofedRate, 'pts')"
        subtitle="No authentication passed"
        :inverted="true"
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
      </CardContent>
    </Card>

    <!-- Breakdown Row 1 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- Combined Orgs / Source IPs with toggle -->
      <SectionCard :title="sourceTitle" :subtitle="sourceSubtitle">
        <template #header-action>
          <ToggleGroup
            type="single"
            :model-value="sourceView"
            variant="outline"
            @update:model-value="v => v && (sourceView = v as SourceView)"
          >
            <ToggleGroupItem value="orgs" class="px-2 py-1 text-xs">Orgs</ToggleGroupItem>
            <ToggleGroupItem value="ips" class="px-2 py-1 text-xs">IPs</ToggleGroupItem>
          </ToggleGroup>
        </template>
        <TopList :loading="sourceLoading" :items="sourceItems" />
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
      <!-- DMARC Status Breakdown -->
      <SectionCard title="DMARC Status" subtitle="message outcome breakdown">
        <AuthBreakdown
          :loading="authStatus !== 'success' || !authData"
          :pass="authData?.pass ?? { count: 0, pct: 0 }"
          :misconfigured="authData?.misconfigured ?? { count: 0, pct: 0 }"
          :spoofed="authData?.spoofed ?? { count: 0, pct: 0 }"
          :total="authData?.total ?? 0"
        />
      </SectionCard>

      <!-- Top Countries -->
      <SectionCard title="Top Countries" subtitle="by message count">
        <TopList
          :loading="countriesStatus === 'pending'"
          :items="(countriesData?.countries ?? []).map(c => ({
            label: countryName(c.name),
            count: c.count,
            share: c.share,
            flag: countryFlag(c.name),
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

      <SectionCard title="Activity Heatmap" subtitle="messages by day &amp; weekday">
        <ClientOnly>
          <HeatMap
            v-if="heatmapStatus === 'success' && heatmapData"
            :entries="heatmapData.entries"
            :from="timeRange.from"
            :to="timeRange.to"
          />
          <Skeleton v-else class="h-[130px] w-full rounded-md" />
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
