<script setup lang="ts">
import { ArrowUp, ArrowDown } from 'lucide-vue-next'

const props = defineProps<{
  label: string
  value: string
  delta?: string
  mono?: boolean
  subtitle?: string
  loading?: boolean
  inverted?: boolean
}>()

const deltaInfo = computed(() => {
  if (!props.delta || props.delta === '—') return null
  const isPositive = props.delta.startsWith('+')
  const isNegative = props.delta.startsWith('-')
  if (!isPositive && !isNegative) return null
  const good = props.inverted ? isNegative : isPositive
  return {
    up: isPositive,
    colorClass: good
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400',
    display: props.delta.replace(/^[+-]/, ''),
  }
})
</script>

<template>
  <Card class="p-4">
    <CardContent class="p-0 space-y-1">
      <template v-if="loading">
        <Skeleton class="h-4 w-24" />
        <Skeleton class="h-8 w-20 mt-1" />
        <Skeleton class="h-4 w-16 mt-1" />
      </template>
      <template v-else>
        <p class="text-sm font-semibold">{{ label }}</p>
        <p :class="mono ? 'font-mono text-lg font-bold truncate' : 'text-2xl font-bold'">
          {{ value }}
        </p>
        <div v-if="deltaInfo" :class="['flex items-center gap-1 text-sm font-medium', deltaInfo.colorClass]">
          <ArrowUp v-if="deltaInfo.up" class="size-3.5 shrink-0" />
          <ArrowDown v-else class="size-3.5 shrink-0" />
          <span>{{ deltaInfo.display }}</span>
        </div>
        <p v-else-if="delta === '—'" class="text-xs text-muted-foreground">—</p>
        <p v-else-if="subtitle" class="text-xs text-muted-foreground">{{ subtitle }}</p>
      </template>
    </CardContent>
  </Card>
</template>
