export type WindowKey = '24h' | '7d' | '30d' | '90d'
export const VALID_WINDOWS: readonly WindowKey[] = ['24h', '7d', '30d', '90d']

export interface UserPreferences {
  window?: WindowKey
}

export const DEFAULT_PREFERENCES: Required<UserPreferences> = {
  window: '7d',
}
