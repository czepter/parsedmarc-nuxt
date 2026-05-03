<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()

const slots = useSlots()
const hasRight = computed(() => !!slots.right)
</script>

<template>
  <div :class="hasRight ? 'flex items-center justify-between gap-4' : undefined">
    <div>
      <h1 class="text-2xl font-semibold">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-muted-foreground">{{ subtitle }}</p>
    </div>
    <div v-if="hasRight">
      <slot name="right" />
    </div>
  </div>
</template>
