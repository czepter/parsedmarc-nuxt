import { describe, it, expect } from 'vitest'
import { parsePreferences } from '../../app/server/utils/preferences'

describe('parsePreferences', () => {
  it('returns default for null', () => {
    expect(parsePreferences(null)).toEqual({ window: '7d' })
  })

  it('returns default for empty object', () => {
    expect(parsePreferences('{}')).toEqual({ window: '7d' })
  })

  it('returns parsed window when valid', () => {
    expect(parsePreferences('{"window":"90d"}')).toEqual({ window: '90d' })
  })

  it('returns parsed window for all valid keys', () => {
    expect(parsePreferences('{"window":"24h"}')).toEqual({ window: '24h' })
    expect(parsePreferences('{"window":"7d"}')).toEqual({ window: '7d' })
    expect(parsePreferences('{"window":"30d"}')).toEqual({ window: '30d' })
  })

  it('strips unknown window values', () => {
    expect(parsePreferences('{"window":"2y"}')).toEqual({ window: '7d' })
  })

  it('returns default for malformed JSON', () => {
    expect(parsePreferences('not json')).toEqual({ window: '7d' })
  })

  it('ignores extra unknown fields', () => {
    expect(parsePreferences('{"window":"90d","theme":"dark"}')).toEqual({ window: '90d' })
  })
})
