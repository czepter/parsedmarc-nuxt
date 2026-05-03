<script setup lang="ts">
type LogLevel = 'info' | 'warn' | 'error' | 'success'

interface LogEntry {
  level: LogLevel
  message: string
  ts: string
}

interface DonePayload {
  messagesSeen: number
  reportsParsed: number
  errorMessage: string | null
}

const props = defineProps<{
  open: boolean
  inboxId: string
  inboxLabel: string
}>()

const emit = defineEmits<{
  close: []
  done: [payload: DonePayload]
}>()

// ── State ────────────────────────────────────────────────────────────────────
const logEntries = ref<LogEntry[]>([])
const scanning = ref(false)
const summary = ref<DonePayload | null>(null)
const logEl = ref<HTMLElement | null>(null)

let es: EventSource | null = null

// ── SSE connection ───────────────────────────────────────────────────────────
function startScan() {
  if (es) {
    es.close()
    es = null
  }
  logEntries.value = []
  summary.value = null
  scanning.value = true

  es = new EventSource(`/api/inboxes/${props.inboxId}/scan-stream`)

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      if (data.type === 'log') {
        logEntries.value.push({ level: data.level, message: data.message, ts: data.ts })
        nextTick(() => {
          if (logEl.value) {
            logEl.value.scrollTop = logEl.value.scrollHeight
          }
        })
      }
      else if (data.type === 'done') {
        scanning.value = false
        summary.value = { messagesSeen: data.messagesSeen, reportsParsed: data.reportsParsed, errorMessage: data.errorMessage }
        emit('done', summary.value)
        es?.close()
        es = null
      }
      else if (data.type === 'error') {
        logEntries.value.push({ level: 'error', message: data.message, ts: new Date().toISOString() })
        scanning.value = false
        es?.close()
        es = null
      }
    }
    catch {
      // Malformed SSE data — ignore
    }
  }

  es.onerror = () => {
    if (scanning.value) {
      logEntries.value.push({
        level: 'error',
        message: 'Connection to server lost',
        ts: new Date().toISOString(),
      })
      scanning.value = false
    }
    es?.close()
    es = null
  }
}

function stopAndClose() {
  es?.close()
  es = null
  emit('close')
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
watch(
  () => props.open,
  (val) => {
    if (val) startScan()
    else {
      es?.close()
      es = null
    }
  },
)

onBeforeUnmount(() => {
  es?.close()
})

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const LEVEL_TEXT: Record<LogLevel, string> = {
  info: 'text-foreground/70',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-500 dark:text-red-400',
  success: 'text-emerald-600 dark:text-emerald-400',
}

const LEVEL_ICON: Record<LogLevel, string> = {
  info: '·',
  warn: '⚠',
  error: '✗',
  success: '✓',
}

const LEVEL_ICON_COLOR: Record<LogLevel, string> = {
  info: 'text-muted-foreground',
  warn: 'text-amber-500',
  error: 'text-red-500',
  success: 'text-emerald-500',
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-200 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
        @click="stopAndClose"
      />
    </Transition>

    <!-- Drawer panel -->
    <Transition
      enter-active-class="transition-transform duration-250 ease-out"
      leave-active-class="transition-transform duration-200 ease-in"
      enter-from-class="translate-x-full"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="open"
        class="fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-full flex-col border-l bg-background shadow-2xl"
      >
        <!-- Header -->
        <div class="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div class="flex items-center gap-3">
            <!-- Live indicator -->
            <span v-if="scanning" class="relative flex h-2.5 w-2.5">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
            </span>
            <span v-else-if="summary && !summary.errorMessage" class="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span v-else-if="summary && summary.errorMessage" class="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span v-else class="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />

            <div>
              <p class="text-sm font-semibold leading-tight">Scan Log</p>
              <p class="text-muted-foreground text-xs">{{ inboxLabel }}</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-muted-foreground"
            aria-label="Close"
            @click="stopAndClose"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </Button>
        </div>

        <!-- Status banner -->
        <div
          v-if="scanning"
          class="flex shrink-0 items-center gap-2 border-b bg-blue-50 px-5 py-2 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        >
          <svg class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Scan in progress…
        </div>
        <div
          v-else-if="summary && !summary.errorMessage"
          class="shrink-0 border-b bg-emerald-50 px-5 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          ✓ Scan complete — {{ summary.messagesSeen }} message(s) seen, {{ summary.reportsParsed }} report(s) parsed
        </div>
        <div
          v-else-if="summary && summary.errorMessage"
          class="shrink-0 border-b bg-amber-50 px-5 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        >
          ⚠ Scan finished with errors — {{ summary.messagesSeen }} message(s) seen, {{ summary.reportsParsed }} parsed
        </div>

        <!-- Log area -->
        <div
          ref="logEl"
          class="flex-1 overflow-y-auto px-4 py-3"
        >
          <!-- Empty / connecting state -->
          <div v-if="!logEntries.length" class="text-muted-foreground py-4 text-center text-xs">
            <svg class="mx-auto mb-2 h-5 w-5 animate-spin opacity-50" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Connecting…
          </div>

          <!-- Log entries -->
          <div class="space-y-0.5 font-mono text-[11px] leading-5">
            <div
              v-for="(entry, i) in logEntries"
              :key="i"
              class="flex gap-2.5"
            >
              <span class="text-muted-foreground/60 shrink-0 tabular-nums select-none">
                {{ formatTime(entry.ts) }}
              </span>
              <span :class="LEVEL_ICON_COLOR[entry.level]" class="w-3 shrink-0 text-center select-none">
                {{ LEVEL_ICON[entry.level] }}
              </span>
              <span :class="LEVEL_TEXT[entry.level]" class="min-w-0 break-words">
                {{ entry.message }}
              </span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3">
          <Button
            v-if="!scanning && logEntries.length"
            variant="outline"
            size="sm"
            @click="startScan"
          >
            Run Again
          </Button>
          <Button variant="outline" size="sm" @click="stopAndClose">
            Close
          </Button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
