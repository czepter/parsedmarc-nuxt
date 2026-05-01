<script setup lang="ts">
defineProps<{
  items: Array<{
    label: string
    sublabel?: string
    count: number
    share: number
    href?: string
    flag?: string
  }>
  loading?: boolean
  emptyText?: string
}>()
</script>

<template>
  <!-- Loading state: 6 skeleton rows -->
  <div v-if="loading" class="space-y-3">
    <div v-for="i in 6" :key="i" class="flex items-center gap-3 py-1.5">
      <Skeleton class="h-3 w-3 shrink-0" />
      <Skeleton :class="['h-3 shrink-0', i % 3 === 0 ? 'w-32' : i % 2 === 0 ? 'w-24' : 'w-40']" />
      <Skeleton class="ml-auto h-3 w-10 shrink-0" />
      <Skeleton class="h-1.5 w-24 shrink-0" />
      <Skeleton class="h-3 w-9 shrink-0" />
    </div>
  </div>

  <!-- Empty state -->
  <p
    v-else-if="!items || items.length === 0"
    class="text-sm text-muted-foreground text-center py-6"
  >
    {{ emptyText ?? 'No data for this time window' }}
  </p>

  <!-- List -->
  <div v-else class="space-y-0">
    <div
      v-for="(item, index) in items.slice(0, 8)"
      :key="item.label"
      class="flex items-center gap-3 py-1.5"
    >
      <!-- Rank -->
      <span class="text-xs text-muted-foreground w-4 shrink-0 text-right">{{ index + 1 }}</span>

      <!-- Flag -->
      <span v-if="item.flag" class="shrink-0">{{ item.flag }}</span>

      <!-- Label + sublabel -->
      <span class="min-w-0 flex-1 flex items-baseline gap-1">
        <Button
          v-if="item.href"
          variant="link"
          size="sm"
          class="p-0 h-auto text-sm font-medium leading-none truncate"
          as-child
        >
          <NuxtLink :to="item.href">{{ item.label }}</NuxtLink>
        </Button>
        <span v-else class="text-sm font-medium truncate">{{ item.label }}</span>
        <span v-if="item.sublabel" class="text-xs text-muted-foreground shrink-0">{{ item.sublabel }}</span>
      </span>

      <!-- Count -->
      <span class="text-sm text-right ml-auto shrink-0">{{ item.count.toLocaleString() }}</span>

      <!-- Progress bar -->
      <Progress :model-value="item.share" class="h-1.5 w-24 shrink-0" />

      <!-- Share % -->
      <span class="text-xs text-muted-foreground w-9 text-right shrink-0">{{ item.share.toFixed(0) }}%</span>
    </div>
  </div>
</template>
