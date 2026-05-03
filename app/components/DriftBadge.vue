<script setup lang="ts">
// Mirrors DriftKind in app/server/utils/drift.ts. Inlined to avoid pulling
// server code into the client bundle through type-only imports.
type DriftKind =
  | 'aligned'
  | 'no-dmarc'
  | 'dns-drift'
  | 'enforcement-drift'
  | 'escalation-drift'

const props = defineProps<{
  kind: DriftKind
  size?: 'sm' | 'md'
}>()

const LABELS: Record<DriftKind, string> = {
  'aligned': 'Aligned',
  'no-dmarc': 'No DMARC',
  'dns-drift': 'DNS drift',
  'enforcement-drift': 'Enforcement drift',
  'escalation-drift': 'Escalation drift',
}

const COLORS: Record<DriftKind, string> = {
  'aligned': 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  'no-dmarc': 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  'dns-drift': 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  'enforcement-drift': 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'escalation-drift': 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
}

const TITLES: Record<DriftKind, string> = {
  'aligned': 'Published policy matches reports and observed enforcement is within thresholds.',
  'no-dmarc': 'No DMARC record published in DNS.',
  'dns-drift': 'DNS DMARC policy differs from the most recent report.',
  'enforcement-drift': 'Published policy is enforcing but receivers are still delivering messages.',
  'escalation-drift': 'Published policy is p=none but receivers quarantine or reject some messages.',
}

const label = computed(() => LABELS[props.kind])
const color = computed(() => COLORS[props.kind])
const title = computed(() => TITLES[props.kind])
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
      color,
      size === 'sm' ? 'h-5' : 'h-6',
    ]"
    :title="title"
  >
    {{ label }}
  </span>
</template>
