import { useDebounceFn } from '@vueuse/core'
import type { WindowKey } from '~/types/preferences'

const WINDOWS: Record<WindowKey, number> = {
  '24h': 86400,
  '7d': 7 * 86400,
  '30d': 30 * 86400,
  '90d': 90 * 86400,
}

export const WINDOW_KEYS = Object.keys(WINDOWS) as WindowKey[]

// Module-scoped so rapid toggling coalesces to a single DB write,
// even if the user clicks 24h → 7d → 30d → 90d in quick succession.
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
    const to = initTime.value
    return { from: to - WINDOWS[selectedWindow.value], to }
  })

  function setWindow(w: WindowKey, opts?: { resetPage?: boolean }) {
    router.push({
      query: {
        ...route.query,
        window: w,
        ...(opts?.resetPage ? { page: 1 } : {}),
      },
    })
    // Only explicit toggle clicks write to DB; URL-driven changes (bookmarks,
    // deep links) do not, so the saved preference stays intentional.
    persistWindow(w)
  }

  return { selectedWindow, timeRange, setWindow, WINDOW_KEYS }
}
