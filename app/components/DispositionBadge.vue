<script setup lang="ts">
type DispositionKind = 'none' | 'quarantine' | 'reject'

const props = defineProps<{
  kind: DispositionKind
  size?: 'sm' | 'md'
}>()

const LABELS: Record<DispositionKind, string> = {
  none: 'none',
  quarantine: 'quarantine',
  reject: 'reject',
}

const COLORS: Record<DispositionKind, string> = {
  none: 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
  quarantine: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  reject: 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
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
