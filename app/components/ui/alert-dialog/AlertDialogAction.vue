<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AlertDialogAction } from 'reka-ui'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <AlertDialogAction :class="cn(buttonVariants({ variant: 'destructive', size: 'sm' }), props.class)">
    <slot />
  </AlertDialogAction>
</template>
