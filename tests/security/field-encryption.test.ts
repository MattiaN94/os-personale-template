import { describe, expect, it } from 'vitest'
import { decryptFieldPayload, encryptFieldPayload, fieldPayloadIsEncrypted } from '../../shared/field-encryption'

const key = Buffer.alloc(32, 7).toString('base64')

describe('restricted D1 field encryption', () => {
  it('round-trips an authenticated payload without cleartext leakage', async () => {
    const encrypted = await encryptFieldPayload({ document_number: 'ABC123', nested: true }, key, 'workspace-a')
    expect(fieldPayloadIsEncrypted(encrypted)).toBe(true)
    expect(encrypted).not.toContain('ABC123')
    await expect(decryptFieldPayload(encrypted, key, 'workspace-a')).resolves.toEqual({ document_number: 'ABC123', nested: true })
  })

  it('binds ciphertext to the workspace and rejects tampering', async () => {
    const encrypted = await encryptFieldPayload({ secret: 42 }, key, 'workspace-a')
    await expect(decryptFieldPayload(encrypted, key, 'workspace-b')).rejects.toThrow('field_payload_authentication_failed')
    const envelope = JSON.parse(encrypted)
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`
    await expect(decryptFieldPayload(JSON.stringify(envelope), key, 'workspace-a')).rejects.toThrow('field_payload_authentication_failed')
  })

  it('rejects restricted payloads that are not encrypted envelopes', async () => {
    await expect(decryptFieldPayload('{"value":1}', key, 'workspace-a')).rejects.toThrow('field_payload_not_encrypted')
  })
})
