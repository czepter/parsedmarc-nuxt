<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <div>
        <CardTitle class="text-base font-semibold">{{ title }}</CardTitle>
        <p v-if="$slots['subtitle'] || subtitle" class="text-xs text-muted-foreground mt-0.5">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
      <slot name="header-action" />
    </CardHeader>
    <CardContent class="pt-0">
      <slot />
    </CardContent>
  </Card>
</template>
