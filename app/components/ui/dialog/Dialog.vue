<script setup lang="ts">
import { DialogRoot } from 'reka-ui'
import type { DialogRootProps, DialogRootEmits } from 'reka-ui'
import { useForwardPropsEmits } from 'reka-ui'

const props = defineProps<DialogRootProps>()
const emits = defineEmits<DialogRootEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DialogRoot v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>
