// H3 helpers (getRequestURL, sendRedirect) and getUserSession are auto-imported.
import prisma from '~~/lib/prisma'
import { parsePreferences } from '~~/app/server/utils/preferences'

// Exact paths that use the time-window filter. /records/[id] deliberately excluded.
const FILTER_PAGES = new Set(['/', '/records'])

export default defineEventHandler(async (event) => {
  // Only HTML page GET requests; skip API calls, assets, POSTs, etc.
  if (event.method !== 'GET') return

  const url = getRequestURL(event)
  if (!FILTER_PAGES.has(url.pathname)) return

  // URL already carries window= — canonical; do nothing. Prevents redirect loops.
  if (url.searchParams.has('window')) return

  // 02-auth.ts already redirected unauthenticated requests; this is defensive.
  const session = await getUserSession(event)
  if (!session.userId) return

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId as number },
      select: { preferences: true },
    })
    const prefs = parsePreferences(user?.preferences ?? null)
    url.searchParams.set('window', prefs.window)
    return sendRedirect(event, url.pathname + '?' + url.searchParams.toString(), 302)
  }
  catch {
    // DB error → fall through; page renders with selectedWindow's hardcoded '7d' fallback.
  }
})
