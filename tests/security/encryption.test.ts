import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { decryptFile, encryptFile } from '../../src/lib/crypto'

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  Object.defineProperty(globalThis, 'File', { value: class File extends Blob { name: string; constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) { super(parts, options); this.name = name } }, configurable: true })
})

describe('client-side document encryption', () => {
  it('round-trips content and does not expose plaintext', async () => {
    const plaintext = 'synthetic private document content'
    const encrypted = await encryptFile(new File([plaintext], 'fixture.txt', { type: 'text/plain' }), 'correct horse battery staple')
    expect(await encrypted.ciphertext.text()).not.toContain(plaintext)
    const decrypted = await decryptFile(encrypted.ciphertext, 'correct horse battery staple', encrypted.metadata)
    expect(new TextDecoder().decode(decrypted)).toBe(plaintext)
  })

  it('rejects a wrong passphrase', async () => {
    const encrypted = await encryptFile(new File(['synthetic'], 'fixture.txt'), 'correct horse battery staple')
    await expect(decryptFile(encrypted.ciphertext, 'wrong passphrase value', encrypted.metadata)).rejects.toBeDefined()
  })
})
