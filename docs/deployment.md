# Cloudflare deployment runbook

## 1. D1

Use the EU-jurisdiction D1 database `personal-os` and apply every migration in
`d1/migrations` in filename order. Migrations define provenance, proposals,
immutable versions, health imports, deadlines, audit, Core+, regulatory rules,
benefits and monitor runs.

Never seed chat estimates as canonical values. Load personal data only from a
reviewed proposal or a reconciled, source-hashed import package.

## 2. R2

Use private EU-jurisdiction buckets:

- `personal-os-documents`, bound as `DOCUMENTS`;
- `personal-os-backups`, bound as `BACKUPS`.

Keep `r2.dev` disabled. Enforce the 25 MB application upload ceiling and retain
an account usage alert. Documents are encrypted in the browser; D1 backups are
encrypted in the Worker before R2 storage.

## 3. Worker secrets

The Worker and PWA deploy together as `personal-os-private`. Required secrets
must be generated independently and never committed:

- `BACKUP_ENCRYPTION_KEY`: random 32-byte base64 key;
- `FIELD_ENCRYPTION_SECRET`: high-entropy recovery secret for D1 envelopes;
- Cloudflare Access service-token secret used only by the private GPT.

Google Calendar remains disabled unless a separate owner-approved OAuth setup
is completed. Missing security configuration must fail closed.

## 4. Cloudflare Access

Create one self-hosted application for the exact Worker hostname:

- an `Allow` policy for the owner identity, protected by MFA and a short
  session;
- a `Service Auth` policy for only the `Personal OS GPT` token;
- service credentials read from the single `Authorization` header.

Set the Access team domain, application audience, owner email and service-token
client ID in Worker variables, enable Access enforcement and redeploy. The
Worker verifies issuer, audience, expiry and identity even after the edge check.
Every route is protected, including static assets, `/health`, `/privacy`,
`/api/*`, `/v1/*` and OAuth callbacks.

## 5. Private GPT

Follow `docs/gpt-setup.md`. The GPT uses a revocable service identity, reads only
minimized context and creates proposals. It must contain no personal Knowledge
file and remain visible only to the owner.

## 6. Data loading

Follow `docs/data-sources.md`:

1. register and verify the source;
2. reconcile dates, units, counts, opening/closing totals and duplicates;
3. stage extracted rows;
4. review the before/after effect;
5. confirm canonicalization in the PWA.

The authenticated health loader validates each row, resumes idempotently by
source hash, records audit events and can promote only a reconciled package.

## 7. Backup and recovery

Daily backups use a `PERSONALOSB1` AES-GCM envelope in private R2. Keep the
32-byte base64 recovery key outside GitHub and outside Cloudflare. A DPAPI copy
may protect the primary Windows machine, but an independent password-manager
copy is still required because DPAPI does not survive loss of that profile.
Run `scripts/protect_recovery_keys.ps1` after creating or rotating local
secrets. It refreshes DPAPI-protected copies of both recovery keys outside the
repository without printing their values.
Use `-RotateMissingBackupKey` only after every backup encrypted with the old key
has been deliberately removed or independently recovered.
Use `scripts/export_recovery_key.ps1` only to create a short-lived plaintext
copy for restore or password-manager import, then delete that copy immediately.

Verify a downloaded backup only in a disposable local database:

```powershell
powershell -File scripts/restore_backup.ps1 -EncryptedBackup <file> -KeyFile <key-file>
```

The restore applies migrations and reconciles every table count. Keep original
essential documents in a separate encrypted archive; free Cloudflare services
have quotas and no permanence or uptime guarantee.

## 8. Release procedure

```powershell
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm audit --prod --audit-level high
npx wrangler deploy --dry-run --config workers/api/wrangler.jsonc
npx wrangler d1 migrations apply personal-os --remote --config workers/api/wrangler.jsonc
npx wrangler deploy --config workers/api/wrangler.jsonc
```

Then verify the complete `docs/acceptance-checklist.md` on desktop and iPhone.
After an Action schema change, re-import the OpenAPI file, replace the GPT
instructions and run one read-only production Action test.
