<script setup lang="ts">
// reka-ui names the AlertDialog root types AlertDialogProps / AlertDialogEmits,
// unlike most other components that use {Name}RootProps / {Name}RootEmits.
import { AlertDialogRoot, useForwardPropsEmits } from 'reka-ui'
import type { AlertDialogProps, AlertDialogEmits } from 'reka-ui'

const props = defineProps<AlertDialogProps>()
const emits = defineEmits<AlertDialogEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <AlertDialogRoot v-bind="forwarded">
    <slot />
  </AlertDialogRoot>
</template>
