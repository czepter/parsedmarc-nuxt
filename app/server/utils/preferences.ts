import { DEFAULT_PREFERENCES, VALID_WINDOWS, type UserPreferences, type WindowKey } from '../../types/preferences'

export function parsePreferences(raw: string | null): Required<UserPreferences> {
  if (!raw) return { ...DEFAULT_PREFERENCES }
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>
    return {
      window: VALID_WINDOWS.includes(parsed.window as WindowKey)
        ? (parsed.window as WindowKey)
        : DEFAULT_PREFERENCES.window,
    }
  }
  catch {
    return { ...DEFAULT_PREFERENCES }
  }
}
