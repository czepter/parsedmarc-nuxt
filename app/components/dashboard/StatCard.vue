<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string
  delta?: string
  mono?: boolean
  subtitle?: string
  loading?: boolean
}>()

const badgeClass = computed(() => {
  if (!props.delta || props.delta === '—') return ''
  if (props.delta.startsWith('+'))
    return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950 border-green-200 dark:border-green-800'
  if (props.delta.startsWith('-'))
    return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950 border-red-200 dark:border-red-800'
  return ''
})
</script>

<template>
  <Card class="p-4">
    <CardContent class="p-0 space-y-1">
      <template v-if="loading">
        <Skeleton class="h-3 w-24" />
        <Skeleton class="h-7 w-20 mt-1" />
        <Skeleton class="h-3 w-16 mt-1" />
      </template>
      <template v-else>
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ label }}</p>
        <p
          :class="mono
            ? 'font-mono text-lg font-bold truncate'
            : 'text-2xl font-bold'"
        >{{ value }}</p>
        <!-- Delta badge -->
        <div v-if="delta !== undefined && delta !== '—'" class="pt-0.5">
          <Badge variant="outline" :class="['text-xs', badgeClass]">{{ delta }}</Badge>
        </div>
        <!-- Neutral delta (—) -->
        <p
          v-else-if="delta === '—'"
          class="text-xs text-muted-foreground"
        >—</p>
        <!-- Static subtitle -->
        <p
          v-else-if="subtitle"
          class="text-xs text-muted-foreground"
        >{{ subtitle }}</p>
      </template>
    </CardContent>
  </Card>
</template>
