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
  barClass: string
  textClass: string
  data: StatusCategory
}

const rows = computed<Row[]>(() => [
  {
    key: 'pass',
    label: 'Pass',
    tooltip: 'DMARC alignment passed — SPF or DKIM verified for the sending domain',
    barClass: 'bg-green-500 dark:bg-green-600',
    textClass: 'text-green-700 dark:text-green-400',
    data: props.pass,
  },
  {
    key: 'misconfigured',
    label: 'Misconfigured',
    tooltip: 'Authentication passed but alignment failed — relay, wrong domain, or forwarding',
    barClass: 'bg-amber-400 dark:bg-amber-500',
    textClass: 'text-amber-700 dark:text-amber-400',
    data: props.misconfigured,
  },
  {
    key: 'spoofed',
    label: 'Spoofed',
    tooltip: 'No authentication passed — message is likely forged',
    barClass: 'bg-red-400 dark:bg-red-500',
    textClass: 'text-red-700 dark:text-red-400',
    data: props.spoofed,
  },
])

function fmtCount(n: number): string {
  return Intl.NumberFormat('en-US').format(n)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Loading state -->
    <template v-if="loading">
      <div v-for="i in 3" :key="i" class="space-y-1.5">
        <div class="flex items-center gap-3">
          <Skeleton class="h-3 w-20 shrink-0" />
          <Skeleton class="h-2 w-full" />
          <Skeleton class="h-3 w-10 shrink-0" />
        </div>
        <Skeleton class="h-3 w-40 ml-24" />
      </div>
    </template>

    <!-- Data state -->
    <template v-else>
      <div v-for="row in rows" :key="row.key" class="space-y-1.5">
        <!-- Bar row -->
        <div class="flex items-center gap-3">
          <!-- Label -->
          <span
            class="text-xs font-medium w-20 shrink-0"
            :class="row.textClass"
            :title="row.tooltip"
          >
            {{ row.label }}
          </span>

          <!-- Fill bar (single segment — width = % of total) -->
          <div class="relative flex h-2 w-full overflow-hidden rounded bg-muted">
            <div
              :class="[row.barClass, 'h-2 rounded transition-all duration-300']"
              :style="{ width: `${row.data.pct}%` }"
            />
          </div>

          <!-- Percentage -->
          <span
            class="text-sm font-semibold w-12 text-right shrink-0 tabular-nums"
            :class="row.textClass"
          >
            {{ total === 0 ? '—' : `${row.data.pct.toFixed(1)}%` }}
          </span>
        </div>

        <!-- Count -->
        <p class="text-xs text-muted-foreground pl-24">
          <template v-if="total === 0">—</template>
          <template v-else>
            {{ fmtCount(row.data.count) }} messages
          </template>
        </p>
      </div>
    </template>
  </div>
</template>
