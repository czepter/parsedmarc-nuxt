<script setup lang="ts">
type StatusKind = 'pass' | 'misconfigured' | 'spoofed'

const props = defineProps<{
  kind: StatusKind
  size?: 'sm' | 'md'
}>()

const LABELS: Record<StatusKind, string> = {
  pass: 'Pass',
  misconfigured: 'Misconfigured',
  spoofed: 'Spoofed',
}

const COLORS: Record<StatusKind, string> = {
  pass: 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
  misconfigured: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  spoofed: 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
}

const label = computed(() => LABELS[props.kind])
const color = computed(() => COLORS[props.kind])
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
      color,
      size === 'sm' ? 'h-5' : 'h-6',
    ]"
  >
    {{ label }}
  </span>
</template>
