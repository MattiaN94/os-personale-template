const BACKUP_MAGIC = new TextEncoder().encode('PERSONALOSB1')
const IV_BYTES = 12
const GCM_TAG_BYTES = 16

export function packEncryptedBackup(iv: Uint8Array, ciphertext: Uint8Array) {
  if (iv.byteLength !== IV_BYTES) throw new Error('backup_iv_invalid')
  if (ciphertext.byteLength < GCM_TAG_BYTES) throw new Error('backup_ciphertext_invalid')
  const result = new Uint8Array(BACKUP_MAGIC.byteLength + IV_BYTES + ciphertext.byteLength)
  result.set(BACKUP_MAGIC, 0)
  result.set(iv, BACKUP_MAGIC.byteLength)
  result.set(ciphertext, BACKUP_MAGIC.byteLength + IV_BYTES)
  return result
}

export function unpackEncryptedBackup(value: Uint8Array) {
  const minimum = BACKUP_MAGIC.byteLength + IV_BYTES + GCM_TAG_BYTES
  if (value.byteLength < minimum) throw new Error('backup_envelope_too_short')
  for (let index = 0; index < BACKUP_MAGIC.byteLength; index += 1) {
    if (value[index] !== BACKUP_MAGIC[index]) throw new Error('backup_envelope_invalid')
  }
  const ivStart = BACKUP_MAGIC.byteLength
  const cipherStart = ivStart + IV_BYTES
  return {
    iv: value.slice(ivStart, cipherStart),
    ciphertext: value.slice(cipherStart),
  }
}
