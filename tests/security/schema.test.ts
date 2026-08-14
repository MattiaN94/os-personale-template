import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(resolve('d1/migrations/0001_initial.sql'), 'utf8')
const corePlusSchema = readFileSync(resolve('d1/migrations/0002_core_plus.sql'), 'utf8')
const specialistSchema = readFileSync(resolve('d1/migrations/0003_specialist_modules.sql'), 'utf8')
const worker = readFileSync(resolve('workers/api/src/index.ts'), 'utf8')
const d1 = readFileSync(resolve('workers/api/src/d1.ts'), 'utf8')
const app = readFileSync(resolve('src/App.tsx'), 'utf8')
const css = readFileSync(resolve('src/App.css'), 'utf8')
const restore = readFileSync(resolve('scripts/restore_backup.mjs'), 'utf8')
const auth = readFileSync(resolve('workers/api/src/auth.ts'), 'utf8')
const browserEnv = readFileSync(resolve('.env.example'), 'utf8')
const devVars = readFileSync(resolve('.dev.vars.example'), 'utf8')
const openApi = readFileSync(resolve('docs/personal-os-actions.openapi.yaml'), 'utf8')
const gptInstructions = readFileSync(resolve('docs/gpt-instructions.md'), 'utf8')
const pwaConfig = readFileSync(resolve('vite.config.ts'), 'utf8')
const apiClient = readFileSync(resolve('src/lib/api.ts'), 'utf8')
const documentClient = readFileSync(resolve('src/lib/documents.ts'), 'utf8')
const serviceWorkerClient = readFileSync(resolve('src/lib/serviceWorker.ts'), 'utf8')
const entrypoint = readFileSync(resolve('src/main.tsx'), 'utf8')

describe('Cloudflare security invariants', () => {
  it('keeps audit, records, sources and document metadata non-deletable', () => {
    expect(schema).toContain('audit_events_no_update')
    expect(schema).toContain('audit_events_no_delete')
    expect(schema).toContain('operation_items_no_delete')
    expect(schema).toContain('sources_no_delete')
    expect(schema).toContain('documents_no_delete')
    expect(worker).not.toContain("app.delete(")
  })

  it('validates Cloudflare Access identity and separates owner from GPT', () => {
    expect(auth).toContain('Cf-Access-Jwt-Assertion')
    expect(auth).toContain('CF_Authorization')
    expect(auth).toContain('CF_ACCESS_AUD')
    expect(auth).toContain("identity.actorType !== 'owner'")
    expect(auth).toContain("identity.actorType !== 'gpt'")
    expect(auth).toContain('GPT_SERVICE_TOKEN_ID_SECRET')
    expect(auth).not.toContain('publicPaths')
  })

  it('limits request bodies even without Content-Length and isolates rate-limit failures', () => {
    expect(worker).toContain("new TextEncoder().encode(text).byteLength > maximumBytes")
    expect(worker).toContain("apiError(c, 413, 'request_too_large'")
    expect(worker).toMatch(/if \(!permitted\)[\s\S]+await next\(\)/)
  })

  it('does not expose confirmation or rejection to GPT Actions', () => {
    expect(worker).not.toContain("app.post('/v1/operations/:batchId/confirm'")
    expect(worker).not.toContain("app.post('/v1/operations/:batchId/reject'")
    expect(openApi).not.toContain('/v1/operations/{batchId}/confirm:')
    expect(openApi).not.toContain('/v1/operations/{batchId}/reject:')
    expect(worker).toContain("app.post('/api/operations/:batchId/confirm'")
  })

  it('keeps the private GPT schema current and within the editor limit', () => {
    expect(gptInstructions.length).toBeLessThanOrEqual(8_000)
    expect(openApi).toContain('version: 1.3.0')
    expect(openApi).toContain('health.ecg')
    expect(openApi).toContain('health.route')
    expect(openApi).toContain('portfolio.performance')
  })

  it('keeps infrastructure secrets outside browser variables', () => {
    expect(browserEnv).not.toContain('GOOGLE_OAUTH_CLIENT_SECRET')
    expect(browserEnv).not.toContain('BACKUP_ENCRYPTION_KEY')
    expect(browserEnv).not.toContain('FIELD_ENCRYPTION_SECRET')
    expect(browserEnv).not.toContain('CF_ACCESS_AUD')
    expect(devVars).toContain('GOOGLE_OAUTH_CLIENT_SECRET')
    expect(devVars).toContain('BACKUP_ENCRYPTION_KEY')
    expect(devVars).toContain('FIELD_ENCRYPTION_SECRET')
    expect(d1).toContain('env.FIELD_ENCRYPTION_SECRET')
    expect(d1).not.toMatch(/(?:encrypt|decrypt)FieldPayload\([^\n]+env\.BACKUP_ENCRYPTION_KEY/)
  })

  it('does not return storage payloads or restricted profile fields to GPT', () => {
    expect(d1).toContain('const { payload_json, ...visible } = row')
    expect(worker).toContain('.map(minimizeDashboardRecord)')
    expect(worker).toContain("!['identity', 'highly_restricted'].includes(String(row.sensitivity))")
  })

  it('uses the narrow Calendar scope and a one-time state transition', () => {
    expect(worker).toContain('https://www.googleapis.com/auth/calendar.events.owned')
    expect(worker).not.toContain("https://www.googleapis.com/auth/calendar'")
    expect(worker).toContain('consumed_at IS NULL')
    expect(worker).toContain('expires_at > ?')
    expect(worker).toContain('encrypted_refresh_token')
  })

  it('marks imports and sources pending review before canonical use', () => {
    expect(schema).toContain("DEFAULT 'pending_review'")
    expect(worker).toContain("state: 'pending_review'")
    expect(worker).toContain('source_review_required: true')
    expect(worker).toContain("severity = 'blocking' AND state = 'open'")
    expect(worker).toContain('source_has_blocking_issues')
  })

  it('keeps temporary excerpts out of backups and purges expired grants', () => {
    const backupTables = worker.match(/const tables = \[([^\]]+)] as const/)?.[1] ?? ''
    expect(backupTables).not.toContain('document_excerpts')
    expect(worker).toContain('DELETE FROM document_excerpts WHERE expires_at <= ?')
    expect(worker).toContain('DELETE FROM upload_grants WHERE expires_at <= ?')
    expect(worker).toContain('DELETE FROM google_calendar_oauth_states WHERE expires_at <= ?')
  })

  it('consumes protected upload links before sending a file to storage', () => {
    expect(app.indexOf('await consumeUploadGrant(tokenHash)')).toBeGreaterThan(0)
    expect(app.indexOf('await consumeUploadGrant(tokenHash)')).toBeLessThan(app.indexOf('await uploadEncryptedDocument'))
  })

  it('allows an interrupted encrypted document upload to be retried', () => {
    expect(worker).toContain("interrupted.state !== 'staged'")
    expect(worker).toContain('idempotent_replay: true')
    expect(worker).toContain('encrypted_content_sha256 = NULL')
  })

  it('never treats an equal title as proof of duplicate content', () => {
    expect(schema).toContain('documents_content_hash_unique')
    expect(schema).not.toMatch(/UNIQUE\s*\(\s*workspace_id\s*,\s*title\s*\)/i)
    expect(worker).toContain('content_sha256')
  })

  it('tracks evidence and freshness without erasing prior versions', () => {
    expect(corePlusSchema).toContain("evidence_status IN ('verified','declared','estimated','planned')")
    expect(corePlusSchema).toContain('expected_refresh_days')
    expect(schema).toContain('operation_items_no_delete')
  })

  it('versions rules and schedules benefit, regulation and vehicle reviews', () => {
    expect(specialistSchema).toContain('CREATE TABLE IF NOT EXISTS regulatory_rules')
    expect(specialistSchema).toContain('CREATE TABLE IF NOT EXISTS benefit_opportunities')
    expect(specialistSchema).toContain('CREATE TABLE IF NOT EXISTS monitor_runs')
    expect(specialistSchema).toContain("'vehicle.revision'")
    expect(specialistSchema).toContain("'home.boiler.maintenance'")
    expect(worker).toContain("['benefits.monthly'")
    expect(worker).toContain("['regulations.monthly'")
    expect(worker).toContain("['vehicle.valuation.quarterly'")
  })

  it('keeps temporary excerpts out of both backup and restore table lists', () => {
    expect(restore).not.toContain("'document_excerpts'")
    expect(restore).toContain("'regulatory_rules'")
    expect(restore).toContain("'benefit_opportunities'")
    expect(restore).toContain('DELETE FROM "regulatory_rules"')
    expect(restore).toContain('DELETE FROM "benefit_opportunities"')
    expect(restore).toContain("'monitor_runs'")
    expect(restore).toContain("'backup_runs'")
    const backupTables = worker.match(/const tables = \[([^\]]+)] as const/)?.[1] ?? ''
    expect(backupTables).toContain('regulatory_rules')
    expect(backupTables).toContain('benefit_opportunities')
  })

  it('provides a persistent visual privacy mode and keeps navigation scoped', () => {
    expect(app).toContain("personal-os-privacy")
    expect(app).toContain("privacy-mode")
    expect(app).toContain("Offusca dati sensibili")
    expect(css).toContain('.privacy-mode tbody td')
    expect(css).toContain('.privacy-mode .special-chart')
    expect(css).toContain('.privacy-mode .registry-form input')
    expect(app).not.toMatch(/\['goals'/)
    expect(openApi).not.toMatch(/enum: \[[^\]]*goals/)
  })

  it('does not let a cached app shell hide an expired Cloudflare Access session', () => {
    // Nothing is precached at all, which is stronger than excluding the shell:
    // behind Cloudflare Access a precache install fetches assets that answer 302
    // to a cross-origin login page, and a worker that fails that way keeps
    // controlling the page while being unable to update itself.
    expect(pwaConfig).toContain('selfDestroying: true')
    expect(pwaConfig).toContain('injectRegister: false')
    expect(pwaConfig).toContain('globPatterns: []')
    expect(pwaConfig).toContain('navigateFallback: undefined')
    expect(pwaConfig).toContain('runtimeCaching: []')
    expect(pwaConfig).not.toContain('cleanupOutdatedCaches')
    // Any worker left by an earlier build is retired from the page, which has
    // already crossed Access and can therefore always complete the unregister.
    expect(serviceWorkerClient).toContain('registration.unregister()')
    expect(serviceWorkerClient).toContain('caches.delete')
    expect(entrypoint).toContain('retireServiceWorkers()')
    expect(apiClient).toContain("redirect: 'manual'")
    expect(apiClient).toContain('access_session_expired')
    expect(apiClient).toContain('response.status >= 300 && response.status < 400')
    expect(apiClient).toContain("[401, 403].includes(response.status)")
    expect(app).toContain('getRegistrations()')
    expect(app).toContain('window.location.replace')
    expect(app).toContain('?reauth=')
    expect(app).not.toContain('/cdn-cgi/access/login/')
    expect(documentClient).toContain("redirect: 'manual'")
    expect(documentClient).toContain('access_session_expired')
  })

  it('contains no local sample dataset or silent offline data substitute', () => {
    expect(app).not.toMatch(/sampleState|fixtureState|mockState/i)
    expect(app).toContain('Nessun dato dimostrativo viene caricato')
    expect(apiClient).toContain("export const liveMode = import.meta.env.PROD")
  })

  it('keeps specialist health context complete and supersedes prior full snapshots', () => {
    expect(worker).toContain("'health.ecg','health.route'")
    expect(worker).toContain('superseded_prior_health_snapshot')
    expect(worker).toContain("['health_workbook', 'apple_health_export'].includes(importedSource.source_type)")
    expect(worker).toContain("source_type IN ('health_workbook','apple_health_export')")
  })
})
