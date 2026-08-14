# Acceptance checklist

Release checks for Personal OS 1.0. Each checked item must be supported by an
automated test, a production verification or both.

## Access and authorization

- [x] Cloudflare Access protects PWA assets and every API route, including
  `/health` and `/privacy`.
- [x] Owner routes require a valid Access JWT for the configured email.
- [x] GPT routes accept only the dedicated service identity and only under
  `/v1/*`.
- [x] Expired, revoked, wrong-audience and wrong-identity tokens fail closed.
- [x] The GPT can read minimized context and create proposals, but cannot
  confirm, reject, delete, execute SQL, run backups or access originals.
- [x] A cached PWA shell detects an expired Access session and offers a clean
  Access reconnection instead of silently falling back to local data.

## Integrity and privacy

- [x] Health, finance, document-derived and corrective operations require owner
  review in the PWA.
- [x] Corrections preserve the superseded version and cannot alter another
  dated event.
- [x] Replayed idempotency keys do not duplicate records.
- [x] Same filename or title is never sufficient duplicate evidence; document
  deduplication uses a content hash.
- [x] Verified, declared, estimated and planned evidence states are separate
  from confirmed, superseded and rejected version states.
- [x] Attachment text is treated as untrusted content and cannot issue tool
  instructions.
- [x] Restricted D1 payloads require authenticated, workspace-bound encryption;
  tampered, cross-workspace and plaintext payloads fail closed.
- [x] Client-encrypted uploads enforce size, hash, protected download and
  byte-for-byte decryption checks.
- [x] Privacy mode masks sensitive metrics, charts, tables, proposals,
  simulators and populated form controls while navigation stays usable.
- [x] Request logs and error bodies contain no document, health or finance
  payloads.

## Functional behavior

- [x] Two PAC operations in different months remain independent.
- [x] A correction changes only the selected historical event.
- [x] Health includes HRV SDNN with 7-day signal and 60-day baseline, full
  metric catalog, source selection, coverage and 28/90/365-day comparisons.
- [x] Health includes nutrition targets, photo-estimate uncertainty, daily
  macros, weight/body measurements, sleep stages, ECG and route summaries.
- [x] Observed workouts can be displayed; no training-plan module exists.
- [x] Finance includes current positions, net worth statistics, cash flow,
  portfolio allocation, geographic exposure, concentration, return and
  drawdown.
- [x] Deterministic, Monte Carlo and capital-runway simulators expose fees,
  inflation, contribution growth and scenario assumptions.
- [x] ISEE modes, exclusions, account balance rules, home equity inputs and
  equivalence scale are traceable and labelled as estimates.
- [x] Home includes cadastral fields, prorated utilities, maintenance,
  warranties and source-backed deadlines.
- [x] Vehicle TCO separates depreciation, running costs and opportunity cost;
  legal, manufacturer and condition-based checks remain distinct.
- [x] Benefit and regulatory monitors require official URLs and versioned
  review records.
- [x] Daily brief returns at most three priorities and never performs them.

## Data and recovery

- [x] Health import reconciles counts and source hashes and excludes manual or
  estimated workbook-only values from automatic promotion.
- [x] Personal data, originals, generated imports, backups and secrets are
  excluded from Git.
- [ ] A fresh post-reset D1 backup is encrypted before private R2 storage and
  restores into a
  disposable database with table-count reconciliation.
- [x] R2 buckets are private and public `r2.dev` access is disabled.
- [ ] Production dependency audit reports no high/critical runtime
  vulnerability for the release commit.
- [ ] The deployed release passes desktop and iPhone visual and interaction QA.
- [ ] The private GPT has the release instructions/OpenAPI, `Only me`
  visibility and no personal Knowledge files.

Unchecked items are release gates, not implied failures. They must be repeated
after the final deployment because the personal database and prior R2 backups
were deliberately reset.
