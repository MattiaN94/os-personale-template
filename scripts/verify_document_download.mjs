import { createHash, webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const [encryptedPath, headersPath, expectedPath] = process.argv.slice(2)
const passphrase = process.env.PERSONAL_OS_VAULT_PASSPHRASE

if (!encryptedPath || !headersPath || !expectedPath || !passphrase) {
  throw new Error('Usage: set PERSONAL_OS_VAULT_PASSPHRASE, then pass encrypted, headers and expected paths')
}

const [ciphertext, rawHeaders, expected] = await Promise.all([
  readFile(encryptedPath),
  readFile(headersPath, 'utf8'),
  readFile(expectedPath),
])

function header(name) {
  const match = rawHeaders.match(new RegExp(`^${name}:\\s*(.+)\\r?$`, 'mi'))
  if (!match) throw new Error(`Missing ${name} header`)
  return match[1].trim()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

const encryptedHash = sha256(ciphertext)
if (encryptedHash !== header('X-Content-Sha256')) throw new Error('Encrypted hash mismatch')

const metadata = JSON.parse(Buffer.from(header('X-Encryption-Metadata'), 'base64').toString('utf8'))
if (metadata.version !== 1 || metadata.algorithm !== 'AES-256-GCM') throw new Error('Unsupported encryption metadata')

const material = await webcrypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(passphrase),
  'PBKDF2',
  false,
  ['deriveKey'],
)
const wrappingKey = await webcrypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: Buffer.from(metadata.salt, 'base64'),
    iterations: metadata.pbkdf2_iterations,
  },
  material,
  { name: 'AES-KW', length: 256 },
  false,
  ['unwrapKey'],
)
const dataKey = await webcrypto.subtle.unwrapKey(
  'raw',
  Buffer.from(metadata.wrapped_key, 'base64'),
  wrappingKey,
  'AES-KW',
  { name: 'AES-GCM', length: 256 },
  false,
  ['decrypt'],
)
const plaintext = Buffer.from(await webcrypto.subtle.decrypt(
  { name: 'AES-GCM', iv: Buffer.from(metadata.iv, 'base64') },
  dataKey,
  ciphertext,
))

const plaintextHash = sha256(plaintext)
if (plaintextHash !== header('X-Plaintext-Sha256')) throw new Error('Plaintext hash mismatch')
if (!plaintext.equals(expected)) throw new Error('Plaintext differs from the expected original')

console.log(JSON.stringify({
  verified: true,
  encrypted_bytes: ciphertext.length,
  plaintext_bytes: plaintext.length,
  media_type: header('X-Original-Media-Type'),
}))
