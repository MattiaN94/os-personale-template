const FIELD_ENVELOPE = 'personal-os-field-v1'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface EncryptedFieldEnvelope {
  _encrypted: typeof FIELD_ENVELOPE
  iv: string
  ciphertext: string
}

function decodeBase64(value: string) {
  try { return Uint8Array.from(atob(value), (part) => part.charCodeAt(0)) }
  catch { throw new Error('field_encryption_key_invalid') }
}

function encodeBase64(value: Uint8Array) {
  let output = ''
  for (const part of value) output += String.fromCharCode(part)
  return btoa(output)
}

function isEnvelope(value: unknown): value is EncryptedFieldEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return candidate._encrypted === FIELD_ENVELOPE && typeof candidate.iv === 'string' && typeof candidate.ciphertext === 'string'
}

async function deriveFieldKey(masterKey: string, workspaceId: string) {
  const bytes = decodeBase64(masterKey)
  if (bytes.byteLength !== 32) throw new Error('field_encryption_key_invalid')
  const material = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: encoder.encode(workspaceId),
    info: encoder.encode(FIELD_ENVELOPE),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function additionalData(workspaceId: string) {
  return encoder.encode(`${FIELD_ENVELOPE}:${workspaceId}:operation_payload`)
}

export async function encryptFieldPayload(payload: Record<string, unknown>, masterKey: string, workspaceId: string) {
  const key = await deriveFieldKey(masterKey, workspaceId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(workspaceId) }, key, encoder.encode(JSON.stringify(payload))))
  return JSON.stringify({ _encrypted: FIELD_ENVELOPE, iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext) } satisfies EncryptedFieldEnvelope)
}

export async function decryptFieldPayload(value: string, masterKey: string, workspaceId: string) {
  let parsed: unknown
  try { parsed = JSON.parse(value) }
  catch { throw new Error('field_payload_invalid') }
  if (!isEnvelope(parsed)) throw new Error('field_payload_not_encrypted')
  const iv = decodeBase64(parsed.iv)
  if (iv.byteLength !== 12) throw new Error('field_payload_invalid')
  const key = await deriveFieldKey(masterKey, workspaceId)
  try {
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: additionalData(workspaceId) }, key, decodeBase64(parsed.ciphertext))
    const payload = JSON.parse(decoder.decode(clear))
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
  } catch {
    throw new Error('field_payload_authentication_failed')
  }
}

export function fieldPayloadIsEncrypted(value: string) {
  try { return isEnvelope(JSON.parse(value)) }
  catch { return false }
}
