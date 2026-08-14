const ITERATIONS = 310_000

export interface EncryptionMetadata {
  version: 1
  algorithm: 'AES-256-GCM'
  key_wrap: 'AES-256-KW/PBKDF2-SHA-256'
  iv: string
  salt: string
  wrapped_key: string
  pbkdf2_iterations: number
}

export interface EncryptedFile {
  ciphertext: Blob
  plaintextSha256: string
  ciphertextSha256: string
  metadata: EncryptionMetadata
}

export async function encryptFile(file: File, passphrase: string): Promise<EncryptedFile> {
  if (passphrase.length < 12) throw new Error('passphrase_too_short')
  const plaintext = await file.arrayBuffer()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await deriveWrappingKey(passphrase, salt)
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const wrappedKey = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, 'AES-KW')
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, plaintext)
  return {
    ciphertext: new Blob([ciphertext], { type: 'application/octet-stream' }),
    plaintextSha256: await sha256Hex(plaintext),
    ciphertextSha256: await sha256Hex(ciphertext),
    metadata: {
      version: 1, algorithm: 'AES-256-GCM', key_wrap: 'AES-256-KW/PBKDF2-SHA-256',
      iv: base64(iv), salt: base64(salt), wrapped_key: base64(new Uint8Array(wrappedKey)), pbkdf2_iterations: ITERATIONS,
    },
  }
}

export async function decryptFile(ciphertext: Blob, passphrase: string, metadata: EncryptionMetadata): Promise<ArrayBuffer> {
  const salt = fromBase64(metadata.salt)
  const iv = fromBase64(metadata.iv)
  const wrappedKey = fromBase64(metadata.wrapped_key)
  const wrappingKey = await deriveWrappingKey(passphrase, salt)
  const dataKey = await crypto.subtle.unwrapKey(
    'raw', wrappedKey, wrappingKey, 'AES-KW', { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dataKey, await ciphertext.arrayBuffer())
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS }, material, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey'])
}

export async function sha256Hex(buffer: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((value) => value.toString(16).padStart(2, '0')).join('') }
function base64(bytes: Uint8Array) { let binary = ''; bytes.forEach((value) => { binary += String.fromCharCode(value) }); return btoa(binary) }
function fromBase64(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)) }
