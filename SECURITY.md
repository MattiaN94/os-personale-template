# Security policy

## Trust boundaries

ChatGPT interprets input but is not the archive. Cloudflare D1 is the canonical
structured store, R2 stores ciphertext, and GitHub stores only source code.

Cloudflare Access protects the same Worker hostname for both people and the
private GPT. Browser requests require an Access JWT for the exact owner email.
GPT requests require a dedicated, revocable service token and are accepted only
on `/v1/*`. The Worker independently validates JWT signature, issuer, audience,
expiry and identity claims. Missing configuration closes the application.

Cloudflare D1 does not provide PostgreSQL-style row-level security. Isolation is
therefore enforced at the Worker boundary: D1 has no public client connection,
every query is scoped to the server-side workspace secret, and owner and GPT
routes have separate authorization middleware.

Payloads marked `identity` or `highly_restricted` receive an additional
application-encryption layer before insertion in D1. The Worker derives a
workspace-bound AES-256-GCM key through HKDF, uses a fresh random IV and binds
the ciphertext to workspace and field purpose with authenticated additional
data. Owner views decrypt only after Access authorization. GPT search and
context omit these payloads. Restricted reads and writes fail closed if the
recovery key is unavailable, invalid or the authenticated envelope cannot be
verified. Plaintext fallback is intentionally unsupported.

The GPT API can read minimized context, search, create proposals or correction
proposals, request a protected upload link and read a separately authorized
masked excerpt. It cannot confirm records, delete data, run SQL, fetch document
originals, administer users, create backups or control Calendar.

## Documents

- The browser encrypts every original with a random AES-256-GCM data key.
- The data key is wrapped with AES-256-KW using a PBKDF2-SHA-256 key derived
  from the owner's vault passphrase.
- Plaintext and passphrase never reach the Worker, D1 or R2.
- R2 objects are private and stored as inert `application/octet-stream` data.
- GPT excerpts are opt-in, masked, purpose-bound, short-lived and revocable.
- A protected upload link is consumed atomically before the first server upload;
  a failed upload requires a new link and cannot make the old one reusable.
- Expired excerpts and upload grants are purged automatically; ephemeral
  excerpts are deliberately excluded from database backups.
- Uploads are capped at 25 MB and checked against a declared content hash.
- An interrupted encrypted upload can be retried without weakening the
  content-hash duplicate check for documents already archived.

Losing the vault passphrase means losing access to encrypted originals. Keep
recovery material offline and separate from Cloudflare credentials.

## Data integrity

Health, finance, document-derived, retroactive and corrective records remain
proposals until the owner reviews their before/after effect in the PWA. A
correction creates a replacement linked through `supersedes_item_id`; history
is retained. D1 triggers block deletion or mutation of audit rows and block
deletion from canonical data tables.

Idempotency keys prevent duplicate retries. Sources have their own review state
and imported rows cannot become canonical merely because a filename looks
plausible. Same title never establishes identical content.

Evidence status is separate from version state. `verified` requires a verified
primary or institution-issued source; owner statements are `declared`,
calculations are `estimated`, and future commitments are `planned`. Confirming
an estimate does not promote it to verified. Superseded versions remain in the
append-only history.

Daily briefs and insights are computed from canonical structured rows. They
return at most three operational priorities and keep periods, evidence and
caveats attached to comparisons. Health correlations are observational and do
not diagnose or infer causality. The private GPT receives only minimized Core+
context relevant to the requested domain.

## Operations

Worker request logging is disabled. Sampled technical logs contain request IDs
and normalized error classes only. Request bodies, document text, email,
financial values and health measurements must never be logged.

Google Calendar is optional and separate from ChatGPT. Its refresh token is
encrypted with a Worker-only key, and only confirmed deadlines are synchronized.
Backups are encrypted with a separate Worker-only key before private R2 storage.

Report vulnerabilities privately to the repository owner using synthetic data.
