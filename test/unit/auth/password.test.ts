import { describe, it, expect } from 'vitest'
import { hash, compare } from '@node-rs/bcrypt'

describe('bcrypt', () => {
  it('hash + compare roundtrip returns true for correct password', async () => {
    const hashed = await hash('super-secret-passw0rd', 10)
    expect(await compare('super-secret-passw0rd', hashed)).toBe(true)
  })

  it('compare returns false for wrong password', async () => {
    const hashed = await hash('correct-passw0rd', 10)
    expect(await compare('wrong-passw0rd', hashed)).toBe(false)
  })
})
