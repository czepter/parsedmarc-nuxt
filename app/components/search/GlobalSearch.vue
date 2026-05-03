<script setup lang="ts">
interface DomainResult {
  type: 'domain'
  name: string
  href: string
}
interface IpResult {
  type: 'ip'
  ip: string
  country: string | null
  href: string
}
interface ForensicResult {
  type: 'forensic'
  id: string
  subject: string
  sourceIp: string
  arrivalDate: string
  href: string
}
type AnyResult = DomainResult | IpResult | ForensicResult

interface SearchResponse {
  domains: DomainResult[]
  ips: IpResult[]
  forensics: ForensicResult[]
  query: string
}

const router = useRouter()
const dialogRef = ref<HTMLDialogElement | null>(null)
const inputRef = ref<{ $el?: HTMLInputElement } | null>(null)
const rawQuery = ref('')
const debouncedQuery = ref('')
const results = ref<SearchResponse | null>(null)
const loading = ref(false)
const focusedIndex = ref(-1)

// Debounce: set debouncedQuery 300ms after last keystroke
let debounceTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
watch(rawQuery, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (val.trim().length < 2) {
    debouncedQuery.value = ''
    results.value = null
    focusedIndex.value = -1
    return
  }
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = val.trim()
  }, 300)
})

// Fetch when debouncedQuery changes
watch(debouncedQuery, async (q) => {
  if (!q) return
  loading.value = true
  focusedIndex.value = -1
  try {
    results.value = await $fetch<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`)
  }
  catch {
    results.value = null
  }
  finally {
    loading.value = false
  }
})

// Flat list of all results for keyboard navigation
const flatResults = computed<AnyResult[]>(() => {
  if (!results.value) return []
  return [
    ...results.value.domains,
    ...results.value.ips,
    ...results.value.forensics,
  ]
})

const hasResults = computed(() =>
  !!results.value && flatResults.value.length > 0,
)

function openSearch() {
  rawQuery.value = ''
  debouncedQuery.value = ''
  results.value = null
  focusedIndex.value = -1
  dialogRef.value?.showModal()
  nextTick(() => inputRef.value?.$el?.focus())
}

function closeSearch() {
  dialogRef.value?.close()
}

function onKeydown(event: KeyboardEvent) {
  const len = flatResults.value.length
  if (len === 0) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusedIndex.value = (focusedIndex.value + 1) % len
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusedIndex.value = focusedIndex.value <= 0 ? len - 1 : focusedIndex.value - 1
  }
  else if (event.key === 'Enter' && focusedIndex.value >= 0) {
    event.preventDefault()
    const item = flatResults.value[focusedIndex.value]
    if (item) {
      closeSearch()
      router.push(item.href)
    }
  }
}

function navigate(href: string) {
  closeSearch()
  router.push(href)
}

// Compute flat index for a given group + local index
function flatIdx(group: 'domain' | 'ip' | 'forensic', localIdx: number): number {
  if (!results.value) return -1
  if (group === 'domain') return localIdx
  if (group === 'ip') return results.value.domains.length + localIdx
  return results.value.domains.length + results.value.ips.length + localIdx
}
</script>

<template>
  <!-- Trigger button in nav -->
  <Button
    variant="outline"
    class="text-muted-foreground h-auto gap-1.5 px-2.5 py-1 text-xs"
    aria-label="Open search"
    @click="openSearch"
  >
    <span>Search</span>
    <kbd class="bg-muted rounded px-1 font-mono text-[10px]">/</kbd>
  </Button>

  <!-- Native dialog modal -->
  <dialog
    ref="dialogRef"
    class="bg-background text-foreground m-auto w-full max-w-lg rounded-lg border p-0 shadow-xl backdrop:bg-black/50"
    @keydown="onKeydown"
  >
    <div class="flex flex-col">
      <!-- Input -->
      <div class="flex items-center gap-2 border-b px-4 py-3">
        <span class="text-muted-foreground text-sm">Search</span>
        <Input
          ref="inputRef"
          v-model="rawQuery"
          type="text"
          placeholder="Domains, IPs, forensic subjects…"
          class="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent text-sm placeholder:text-muted-foreground"
          autocomplete="off"
          spellcheck="false"
        />
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground h-auto px-1.5 py-0.5 text-xs"
          aria-label="Close search"
          @click="closeSearch"
        >
          Esc
        </Button>
      </div>

      <!-- Results body -->
      <div class="max-h-80 overflow-y-auto p-2">
        <!-- Loading -->
        <p v-if="loading" class="text-muted-foreground px-3 py-4 text-center text-sm">
          Searching…
        </p>

        <!-- Empty query -->
        <p
          v-else-if="rawQuery.trim().length < 2 && !results"
          class="text-muted-foreground px-3 py-4 text-center text-sm"
        >
          Type at least 2 characters to search.
        </p>

        <!-- No results -->
        <p
          v-else-if="results && !hasResults"
          class="text-muted-foreground px-3 py-4 text-center text-sm"
        >
          No results for "{{ results.query }}".
        </p>

        <!-- Grouped results -->
        <template v-else-if="results && hasResults">
          <!-- Domains group -->
          <div v-if="results.domains.length > 0" class="mb-2">
            <p class="text-muted-foreground mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider">
              Domains
            </p>
            <Button
              v-for="(item, i) in results.domains"
              :key="item.name"
              variant="ghost"
              :class="[
                'w-full justify-between text-left px-3 py-2 h-auto text-sm font-normal',
                focusedIndex === flatIdx('domain', i) ? 'bg-accent text-accent-foreground' : '',
              ]"
              @click="navigate(item.href)"
              @mouseenter="focusedIndex = flatIdx('domain', i)"
            >
              <span class="font-mono">{{ item.name }}</span>
              <span class="text-muted-foreground text-xs">Domain</span>
            </Button>
          </div>

          <!-- IPs group -->
          <div v-if="results.ips.length > 0" class="mb-2">
            <p class="text-muted-foreground mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider">
              IP Addresses
            </p>
            <Button
              v-for="(item, i) in results.ips"
              :key="item.ip"
              variant="ghost"
              :class="[
                'w-full justify-between text-left px-3 py-2 h-auto text-sm font-normal',
                focusedIndex === flatIdx('ip', i) ? 'bg-accent text-accent-foreground' : '',
              ]"
              @click="navigate(item.href)"
              @mouseenter="focusedIndex = flatIdx('ip', i)"
            >
              <span class="font-mono">{{ item.ip }}</span>
              <span class="text-muted-foreground text-xs">{{ item.country ?? 'IP' }}</span>
            </Button>
          </div>

          <!-- Forensics group -->
          <div v-if="results.forensics.length > 0">
            <p class="text-muted-foreground mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider">
              Forensic Reports
            </p>
            <Button
              v-for="(item, i) in results.forensics"
              :key="item.id"
              variant="ghost"
              :class="[
                'w-full justify-between text-left px-3 py-2 h-auto text-sm font-normal',
                focusedIndex === flatIdx('forensic', i) ? 'bg-accent text-accent-foreground' : '',
              ]"
              @click="navigate(item.href)"
              @mouseenter="focusedIndex = flatIdx('forensic', i)"
            >
              <span class="truncate max-w-xs">{{ item.subject || '(no subject)' }}</span>
              <span class="text-muted-foreground ml-2 shrink-0 text-xs">
                {{ new Date(item.arrivalDate).toLocaleDateString() }}
              </span>
            </Button>
          </div>
        </template>
      </div>

      <!-- Footer hint -->
      <div class="text-muted-foreground border-t px-4 py-2 text-[10px]">
        <span>↑↓ navigate</span>
        <span class="mx-2">·</span>
        <span>Enter to open</span>
        <span class="mx-2">·</span>
        <span>Esc to close</span>
      </div>
    </div>
  </dialog>
</template>
