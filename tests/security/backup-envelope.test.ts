import { describe, expect, it } from 'vitest'
import { packEncryptedBackup, unpackEncryptedBackup } from '../../shared/backup'

describe('backup envelope', () => {
  it('keeps the IV and authenticated ciphertext in one portable file', () => {
    const iv = Uint8Array.from({ length: 12 }, (_, index) => index)
    const ciphertext = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)
    const unpacked = unpackEncryptedBackup(packEncryptedBackup(iv, ciphertext))
    expect(unpacked.iv).toEqual(iv)
    expect(unpacked.ciphertext).toEqual(ciphertext)
  })

  it('rejects files without the Personal OS envelope marker', () => {
    expect(() => unpackEncryptedBackup(new Uint8Array(40))).toThrow('backup_envelope_invalid')
  })
})
