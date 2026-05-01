<script setup lang="ts">
const props = defineProps<{
  dkim: { pass: number; fail: number; total: number }
  spf:  { pass: number; fail: number; total: number }
  loading?: boolean
}>()

interface Row {
  label: string
  data: { pass: number; fail: number; total: number }
}

const rows = computed<Row[]>(() => [
  { label: 'DKIM', data: props.dkim },
  { label: 'SPF',  data: props.spf  },
])

function passPercent(d: { pass: number; total: number }): number {
  if (d.total === 0) return 0
  return (d.pass / d.total) * 100
}

function failPercent(d: { fail: number; total: number }): number {
  if (d.total === 0) return 0
  return (d.fail / d.total) * 100
}

function fmtRate(d: { pass: number; total: number }): string {
  if (d.total === 0) return '—'
  return `${((d.pass / d.total) * 100).toFixed(1)}%`
}

function fmtCount(n: number): string {
  return n.toLocaleString()
}
</script>

<template>
  <!-- Loading state -->
  <div v-if="loading" class="space-y-4">
    <div v-for="i in 2" :key="i" class="space-y-1.5">
      <div class="flex items-center gap-3">
        <Skeleton class="h-3 w-8 shrink-0" />
        <Skeleton class="h-2 w-full" />
        <Skeleton class="h-3 w-12 shrink-0" />
        <Skeleton class="h-3 w-8 shrink-0" />
      </div>
      <Skeleton class="h-3 w-40 ml-11" />
    </div>
  </div>

  <!-- Data state -->
  <div v-else class="space-y-4">
    <div v-for="row in rows" :key="row.label" class="space-y-1.5">
      <!-- Bar row -->
      <div class="flex items-center gap-3">
        <!-- Label -->
        <span class="text-xs font-mono font-medium w-8 shrink-0 text-muted-foreground">
          {{ row.label }}
        </span>

        <!-- Stacked bar -->
        <div class="flex h-2 w-full overflow-hidden rounded bg-muted">
          <div
            class="bg-green-500 dark:bg-green-600 h-2 rounded-l"
            :style="{ width: `${passPercent(row.data)}%` }"
          />
          <div
            class="bg-red-400 dark:bg-red-500 h-2 rounded-r"
            :style="{ width: `${failPercent(row.data)}%` }"
          />
        </div>

        <!-- Pass rate -->
        <span class="text-sm font-semibold w-12 text-right shrink-0">
          {{ fmtRate(row.data) }}
        </span>

        <!-- Pass label -->
        <span class="text-xs text-green-600 dark:text-green-400 w-8 shrink-0">pass</span>
      </div>

      <!-- Count breakdown -->
      <p class="text-xs text-muted-foreground pl-11">
        <template v-if="row.data.total === 0">—</template>
        <template v-else>
          {{ fmtCount(row.data.pass) }} pass · {{ fmtCount(row.data.fail) }} fail
        </template>
      </p>
    </div>
  </div>
</template>
