<script setup lang="ts">
import type { WindowKey } from '~/types/preferences'

type MoreOption = '6mo' | '12mo' | 'custom'

const MORE_OPTIONS: Array<{ key: MoreOption; label: string }> = [
  { key: '6mo', label: '6 months' },
  { key: '12mo', label: '12 months' },
  { key: 'custom', label: 'Custom range' },
]

const props = defineProps<{
  open: boolean
  currentWindow: WindowKey
  currentFrom?: number
  currentTo?: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: [window: WindowKey, from?: number, to?: number]
}>()

const todayStr = new Date().toISOString().split('T')[0]

function epochToDateStr(epoch: number) {
  return new Date(epoch * 1000).toISOString().split('T')[0]
}

const selected = ref<MoreOption>('6mo')
const fromDate = ref(todayStr)
const toDate = ref(todayStr)
const fromError = ref('')
const toError = ref('')

watch(() => props.open, (val) => {
  if (!val) return
  const w = props.currentWindow
  selected.value = (['6mo', '12mo', 'custom'] as const).includes(w as MoreOption)
    ? (w as MoreOption)
    : '6mo'
  fromDate.value = props.currentFrom ? epochToDateStr(props.currentFrom) : todayStr
  toDate.value = props.currentTo ? epochToDateStr(props.currentTo) : todayStr
  fromError.value = ''
  toError.value = ''
})

const canApply = computed(() =>
  selected.value !== 'custom' || (!!fromDate.value && !!toDate.value && !fromError.value && !toError.value),
)

function validateDates(): boolean {
  fromError.value = ''
  toError.value = ''
  if (selected.value !== 'custom') return true
  const from = new Date(fromDate.value)
  const to = new Date(toDate.value)
  if (!fromDate.value || isNaN(from.getTime())) { fromError.value = 'Invalid date'; return false }
  if (!toDate.value || isNaN(to.getTime())) { toError.value = 'Invalid date'; return false }
  if (from >= to) { toError.value = 'Must be after start'; return false }
  return true
}

function handleApply() {
  if (!validateDates()) return
  if (selected.value === 'custom') {
    const from = Math.floor(new Date(fromDate.value).getTime() / 1000)
    const to = Math.floor(new Date(`${toDate.value}T23:59:59`).getTime() / 1000)
    emit('apply', 'custom', from, to)
  }
  else {
    emit('apply', selected.value)
  }
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="emit('update:open', false)"
        />

        <!-- Panel -->
        <div class="relative z-10 w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg mx-4">
          <h2 class="text-lg font-semibold mb-4">Date range</h2>

          <div class="space-y-1">
            <div
              v-for="opt in MORE_OPTIONS"
              :key="opt.key"
              class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted"
              @click="selected = opt.key"
            >
              <div
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                :class="selected === opt.key ? 'border-foreground' : 'border-muted-foreground'"
              >
                <div v-if="selected === opt.key" class="h-2 w-2 rounded-full bg-foreground" />
              </div>
              <span class="text-sm">{{ opt.label }}</span>
            </div>

            <!-- Custom date inputs -->
            <div v-if="selected === 'custom'" class="mt-3 flex items-start gap-2 pl-7">
              <div class="flex-1">
                <label class="mb-1 block text-xs text-muted-foreground">From</label>
                <Input v-model="fromDate" type="date" :max="toDate || todayStr" @blur="validateDates" />
                <p v-if="fromError" class="mt-1 text-xs text-destructive">{{ fromError }}</p>
              </div>
              <span class="mt-6 shrink-0 text-muted-foreground">–</span>
              <div class="flex-1">
                <label class="mb-1 block text-xs text-muted-foreground">To</label>
                <Input v-model="toDate" type="date" :min="fromDate" :max="todayStr" @blur="validateDates" />
                <p v-if="toError" class="mt-1 text-xs text-destructive">{{ toError }}</p>
              </div>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <Button variant="ghost" @click="emit('update:open', false)">Cancel</Button>
            <Button :disabled="!canApply" @click="handleApply">Apply</Button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
