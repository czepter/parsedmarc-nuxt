import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/** Derive a 32-byte AES key from an arbitrary-length password via SHA-256. */
function deriveKey(password: string): Buffer {
  return createHash('sha256').update(password).digest()
}

/**
 * Encrypt `plaintext` with AES-256-GCM.
 * Returns a string of the form `<ivHex>:<authTagHex>:<encryptedHex>`.
 * A fresh random 12-byte IV is generated on every call.
 */
export function encrypt(plaintext: string, password: string): string {
  const key = deriveKey(password)
  const iv = randomBytes(12) // 96-bit IV — recommended for AES-GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

/**
 * Decrypt a ciphertext produced by `encrypt`.
 * Throws if the ciphertext is malformed, the password is wrong, or
 * the authentication tag does not verify (tampered data).
 */
export function decrypt(ciphertext: string, password: string): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, authTagHex, encryptedHex] = parts
  const key = deriveKey(password)
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}
