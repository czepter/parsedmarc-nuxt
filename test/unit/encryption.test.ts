import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../app/server/utils/encryption'

const PASSWORD = 'test-encryption-password-for-unit-tests-only'

describe('encrypt / decrypt', () => {
  it('round-trips plaintext correctly', () => {
    const original = 'my-imap-secret-password!'
    const ciphertext = encrypt(original, PASSWORD)
    expect(decrypt(ciphertext, PASSWORD)).toBe(original)
  })

  it('produces different ciphertext for the same input (random IV)', () => {
    const a = encrypt('same-plaintext', PASSWORD)
    const b = encrypt('same-plaintext', PASSWORD)
    expect(a).not.toBe(b)
  })

  it('ciphertext is three colon-separated hex-only segments', () => {
    const parts = encrypt('hello', PASSWORD).split(':')
    expect(parts).toHaveLength(3)
    expect(parts.every(p => /^[0-9a-f]+$/i.test(p))).toBe(true)
  })

  it('throws when decrypting with the wrong password', () => {
    const ciphertext = encrypt('secret', PASSWORD)
    expect(() => decrypt(ciphertext, 'wrong-password')).toThrow()
  })

  it('throws on malformed ciphertext', () => {
    expect(() => decrypt('not-valid-ciphertext', PASSWORD)).toThrow()
  })
})
