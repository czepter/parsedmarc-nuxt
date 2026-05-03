<script setup lang="ts">
type DriftKind =
  | 'aligned'
  | 'no-dmarc'
  | 'dns-drift'
  | 'enforcement-drift'
  | 'escalation-drift'

interface DriftReport {
  kind: DriftKind
  details: string
  dnsPolicy: string | null
  reportPolicy: string | null
  observed: Record<string, number>
  observedTotal: number
  windowDays: number
}

const props = defineProps<{
  domain: string
}>()

const { data, status } = await useFetch<DriftReport>(
  `/api/domains/${encodeURIComponent(props.domain)}/drift`,
  { key: `drift-${props.domain}` },
)

const COLOR: Record<DriftKind, string> = {
  'aligned': '',
  'no-dmarc': 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200',
  'dns-drift': 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200',
  'enforcement-drift': 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200',
  'escalation-drift': 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 text-purple-900 dark:text-purple-200',
}

const HEADING: Record<DriftKind, string> = {
  'aligned': '',
  'no-dmarc': 'No DMARC record',
  'dns-drift': 'DNS drift detected',
  'enforcement-drift': 'Enforcement drift detected',
  'escalation-drift': 'Escalation drift detected',
}
</script>

<template>
  <div v-if="status === 'pending'" class="h-20 animate-pulse rounded-lg bg-muted" />

  <div
    v-else-if="data && data.kind !== 'aligned'"
    :class="['rounded-lg border p-4 space-y-2', COLOR[data.kind]]"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <p class="text-sm font-semibold">{{ HEADING[data.kind] }}</p>
        <p class="text-sm leading-relaxed">{{ data.details }}</p>
      </div>
    </div>
    <div
      v-if="data.observedTotal > 0"
      class="flex flex-wrap gap-3 pt-1 text-xs opacity-90"
    >
      <span>
        Observed dispositions ({{ data.windowDays }}d, {{ data.observedTotal.toLocaleString('en-US') }} msgs):
      </span>
      <span v-for="(count, disposition) in data.observed" :key="disposition" class="font-mono">
        {{ disposition }}={{ count.toLocaleString('en-US') }}
      </span>
    </div>
  </div>
</template>
