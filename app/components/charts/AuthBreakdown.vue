<script setup lang="ts">
interface StatusCategory {
  count: number
  pct: number
}

const props = defineProps<{
  pass: StatusCategory
  misconfigured: StatusCategory
  spoofed: StatusCategory
  total: number
  loading?: boolean
}>()

interface Row {
  key: 'pass' | 'misconfigured' | 'spoofed'
  label: string
  tooltip: string
  textClass: string
  barClass: string
  data: StatusCategory
}

const rows = computed<Row[]>(() => [
  {
    key: 'pass',
    label: 'Pass',
    tooltip: 'DMARC alignment passed — SPF or DKIM verified for the sending domain',
    textClass: 'text-green-700 dark:text-green-400',
    barClass: 'bg-green-600 dark:bg-green-500',
    data: props.pass,
  },
  {
    key: 'misconfigured',
    label: 'Misconfigured',
    tooltip: 'Authentication passed but alignment failed — relay, wrong domain, or forwarding',
    textClass: 'text-amber-700 dark:text-amber-400',
    barClass: 'bg-amber-500 dark:bg-amber-400',
    data: props.misconfigured,
  },
  {
    key: 'spoofed',
    label: 'Spoofed',
    tooltip: 'No authentication passed — message is likely forged',
    textClass: 'text-red-700 dark:text-red-400',
    barClass: 'bg-red-600 dark:bg-red-500',
    data: props.spoofed,
  },
])
</script>

<template>
  <div v-if="loading" class="space-y-0">
    <div v-for="i in 3" :key="i" class="flex items-center gap-3 py-1.5">
      <Skeleton class="h-3 w-24 shrink-0" />
      <Skeleton class="ml-auto h-3 w-10 shrink-0" />
      <Skeleton class="h-1.5 w-24 shrink-0" />
      <Skeleton class="h-3 w-9 shrink-0" />
    </div>
  </div>

  <div v-else class="space-y-0">
    <div v-for="row in rows" :key="row.key" class="flex items-center gap-3 py-1.5">
      <span
        class="text-sm font-medium flex-1 min-w-0"
        :class="row.textClass"
        :title="row.tooltip"
      >
        {{ row.label }}
      </span>

      <span class="text-sm text-right shrink-0">
        {{ total === 0 ? '—' : row.data.count.toLocaleString() }}
      </span>

      <Progress :model-value="row.data.pct" class="h-1.5 w-24 shrink-0" :indicator-class="row.barClass" />

      <span class="text-xs text-muted-foreground w-9 text-right shrink-0">
        {{ total === 0 ? '—' : `${row.data.pct.toFixed(0)}%` }}
      </span>
    </div>
  </div>
</template>
