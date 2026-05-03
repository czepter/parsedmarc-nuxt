<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  AlertDialogContent,
  AlertDialogPortal,
} from 'reka-ui'
import type { AlertDialogContentProps, AlertDialogContentEmits } from 'reka-ui'
import { reactiveOmit } from '@vueuse/core'
import { useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'
import AlertDialogOverlay from './AlertDialogOverlay.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<AlertDialogContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<AlertDialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogContent
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg',
        props.class,
      )"
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
