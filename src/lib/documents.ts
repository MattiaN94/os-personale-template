import { decryptFile, encryptFile, sha256Hex } from './crypto'
import type { EncryptionMetadata } from './crypto'
import { apiRequest } from './api'

interface UploadInput { file: File; passphrase: string; workspaceId: string; maskedExcerpt?: string; documentType?: string; sensitivity?: 'normal' | 'personal' | 'financial' | 'health' | 'identity' | 'highly_restricted' }

export async function uploadEncryptedDocument(input: UploadInput) {
  const encrypted = await encryptFile(input.file, input.passphrase)
  const document = await apiRequest<{ id: string }>('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      title: input.file.name,
      document_type: input.documentType || documentType(input.file.name),
      sensitivity: input.sensitivity ?? 'personal',
      content_sha256: encrypted.plaintextSha256,
      byte_count: encrypted.ciphertext.size,
      media_type: input.file.type || 'application/octet-stream',
      encryption_metadata: encrypted.metadata,
    }),
  })
  await apiRequest<{ stored: boolean }>(`/api/documents/${document.id}/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Content-Sha256': encrypted.ciphertextSha256 },
    body: encrypted.ciphertext,
  })
  if (input.maskedExcerpt) {
    await apiRequest(`/api/documents/${document.id}/excerpts`, {
      method: 'POST',
      body: JSON.stringify({ workspace_id: input.workspaceId, masked_text: input.maskedExcerpt, purpose: "Analisi autorizzata dall'utente", ttl_minutes: 60 }),
    })
  }
  return document
}

export async function downloadDecryptedDocument(documentId: string, title: string, passphrase: string) {
  if (passphrase.length < 12) throw new Error('passphrase_too_short')
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/content`, {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'manual',
    headers: { Accept: 'application/octet-stream' },
  })
  if (response.type === 'opaqueredirect' || response.status === 0 || (response.status >= 300 && response.status < 400)) throw new Error('access_session_expired')
  if (!response.ok) throw new Error(`download_http_${response.status}`)
  const ciphertext = await response.blob()
  const expectedEncryptedHash = requiredHeader(response, 'X-Content-Sha256')
  if (await sha256Hex(await ciphertext.arrayBuffer()) !== expectedEncryptedHash) throw new Error('encrypted_hash_mismatch')
  const metadata = JSON.parse(new TextDecoder().decode(fromBase64(requiredHeader(response, 'X-Encryption-Metadata')))) as EncryptionMetadata
  const plaintext = await decryptFile(ciphertext, passphrase, metadata)
  if (await sha256Hex(plaintext) !== requiredHeader(response, 'X-Plaintext-Sha256')) throw new Error('plaintext_hash_mismatch')
  const mediaType = response.headers.get('X-Original-Media-Type') || 'application/octet-stream'
  const objectUrl = URL.createObjectURL(new Blob([plaintext], { type: mediaType }))
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = safeFilename(title)
    anchor.rel = 'noopener'
    anchor.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
  }
}

function requiredHeader(response: Response, name: string) {
  const value = response.headers.get(name)
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function fromBase64(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)) }
function safeFilename(value: string) {
  const sanitized = [...value].map((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character).join('')
  return sanitized.slice(0, 180) || 'documento'
}

function documentType(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('bollett')) return 'utility_bill'
  if (lower.includes('refert')) return 'medical_report'
  if (lower.includes('ricevut') || lower.includes('scontr')) return 'receipt'
  return 'document'
}
