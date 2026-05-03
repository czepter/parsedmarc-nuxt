import { useDebounceFn } from '@vueuse/core'
import type { WindowKey } from '~/types/preferences'

const PRESET_SECONDS: Partial<Record<WindowKey, number>> = {
  '24h': 86400,
  '7d': 7 * 86400,
  '30d': 30 * 86400,
  '90d': 90 * 86400,
  '6mo': 182 * 86400,
  '12mo': 365 * 86400,
}

export const QUICK_WINDOWS: WindowKey[] = ['24h', '7d', '30d', '90d']
export const WINDOW_KEYS: WindowKey[] = ['24h', '7d', '30d', '90d', '6mo', '12mo', 'custom']

export const MORE_WINDOW_LABELS: Partial<Record<WindowKey, string>> = {
  '6mo': '6 months',
  '12mo': '12 months',
  'custom': 'Custom',
}

// Module-scoped so rapid toggling coalesces to a single DB write.
const persistWindow = useDebounceFn(async (window: WindowKey) => {
  try {
    await $fetch('/api/me/preferences', { method: 'PATCH', body: { window } })
  }
  catch {
    // Best-effort — UX must never break if persistence fails.
  }
}, 400)

export function useWindowFilter() {
  const route = useRoute()
  const router = useRouter()

  const selectedWindow = computed<WindowKey>(() => {
    const w = route.query.window as string
    return WINDOW_KEYS.includes(w as WindowKey) ? (w as WindowKey) : '7d'
  })

  // Shared with SSR — both server and client produce identical cache keys.
  const initTime = useState('dashboardInitTime', () => Math.floor(Date.now() / 1000))

  const timeRange = computed(() => {
    const w = selectedWindow.value
    if (w === 'custom') {
      const from = Number(route.query.from)
      const to = Number(route.query.to)
      if (from && to) return { from, to }
    }
    const seconds = PRESET_SECONDS[w] ?? PRESET_SECONDS['7d']!
    return { from: initTime.value - seconds, to: initTime.value }
  })

  function setWindow(w: WindowKey, opts?: { from?: number; to?: number; resetPage?: boolean }) {
    if (!WINDOW_KEYS.includes(w)) return
    const query: Record<string, unknown> = {
      ...route.query,
      window: w,
      ...(opts?.resetPage ? { page: 1 } : {}),
    }
    if (w === 'custom' && opts?.from && opts?.to) {
      query.from = opts.from
      query.to = opts.to
    }
    else {
      delete query.from
      delete query.to
    }
    router.push({ query })
    if (w !== 'custom') persistWindow(w)
  }

  return { selectedWindow, timeRange, setWindow, QUICK_WINDOWS, WINDOW_KEYS, MORE_WINDOW_LABELS }
}
