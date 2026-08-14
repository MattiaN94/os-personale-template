import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import {
  contextQuerySchema,
  correctionSchema,
  decisionSchema,
  operationSensitivity,
  proposeOperationsSchema,
  searchQuerySchema,
} from '../../../shared/contracts'
import { detectPromptInjection, sanitizeLogValue } from '../../../shared/sanitization'
import { packEncryptedBackup, unpackEncryptedBackup } from '../../../shared/backup'
import { rateLimitPolicy } from '../../../shared/rate-limit'
import { authenticateAccess, requireGpt, requireOwner, requireSameOrigin } from './auth'
import type { AccessIdentity, Env, Variables } from './bindings'
import {
  decideOperationBatch,
  enforceRateLimit,
  ensureWorkspace,
  getDashboard,
  getHealthSeries,
  isoNow,
  minimizeRecord,
  proposeOperations,
  writeAudit,
} from './d1'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()
const MAX_ENCRYPTED_FILE_BYTES = 25 * 1024 * 1024
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned'

app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  await next()
  c.header('X-Request-Id', c.get('requestId'))
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()')
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
})
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    // 'wasm-unsafe-eval' is the narrow grant that lets the on-device PDF and OCR
    // runtimes compile WebAssembly. It does not enable eval() or inline script.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    workerSrc: ["'self'", 'blob:'],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
  strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
  referrerPolicy: 'no-referrer',
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
}))
app.use('*', authenticateAccess)
app.use('/api/*', requireOwner)
app.use('/api/*', requireSameOrigin)
app.use('/v1/*', requireGpt)
app.use('/api/*', rateLimit('pwa'))
app.use('/v1/*', rateLimit('gpt'))
app.use('/api/*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store') })
app.use('/v1/*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store') })

app.get('/health', (c) => c.json({ status: 'ok', service: 'personal-os', database: 'cloudflare-d1', storage: c.env.DOCUMENTS_ENABLED === 'true' ? 'r2-enabled' : 'r2-closed' }))
app.get('/privacy', (c) => c.html(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>Privacy Personal OS</title><style>body{max-width:720px;margin:48px auto;padding:0 20px;font:16px/1.6 system-ui;color:#152536}h1{color:#102a43}</style></head><body><h1>Privacy Personal OS</h1><p>Servizio privato a utente singolo. Cloudflare Access protegge applicazione e API; D1 conserva dati strutturati con provenienza e versioni.</p><p>Gli originali vengono cifrati sul dispositivo prima di R2. La passphrase non viene trasmessa. Il GPT legge riepiloghi minimizzati e crea soltanto proposte: salute, finanza, documenti e correzioni vengono confermati nella PWA.</p><p>Non sono disponibili SQL generico, cancellazione remota o download degli originali tramite GPT. I log tecnici non contengono il corpo delle richieste.</p></body></html>`))

app.get('/api/session', async (c) => {
  const workspace = await ensureWorkspace(c.env)
  const identity = c.get('identity')
  return c.json({ email: identity.email, workspace, access: 'cloudflare-access', mfa_policy: 'enforced-at-access-edge' })
})

app.get('/api/dashboard', async (c) => c.json(await getDashboard(c.env)))

app.get('/api/health-series', async (c) => {
  const parsed = z.object({
    metric_key: z.string().regex(/^[A-Za-z0-9]+([._-][A-Za-z0-9]+)*$/).max(200),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(5000).default(3000),
  }).safeParse(c.req.query())
  if (!parsed.success) return validationError(c, parsed.error)
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) return apiError(c, 400, 'invalid_date_range', 'Intervallo date non valido')
  return c.json(await getHealthSeries(c.env, parsed.data.metric_key, parsed.data.from, parsed.data.to, parsed.data.limit))
})

app.post('/api/operations/propose', async (c) => {
  const parsed = proposeOperationsSchema.safeParse(await safeJson(c))
  if (!parsed.success) return validationError(c, parsed.error)
  try { return c.json(await proposeOperations(c.env, c.get('identity'), parsed.data), 201) }
  catch (error) { return domainError(c, error) }
})

app.post('/api/operations/:batchId/confirm', async (c) => {
  const batchId = z.uuid().safeParse(c.req.param('batchId'))
  const body = decisionSchema.safeParse(await safeJson(c))
  if (!batchId.success) return validationError(c, batchId.error)
  if (!body.success) return validationError(c, body.error)
  try { return c.json(await decideOperationBatch(c.env, c.get('identity'), batchId.data, 'confirm', body.data.note)) }
  catch (error) { return domainError(c, error) }
})

app.post('/api/operations/:batchId/reject', async (c) => {
  const batchId = z.uuid().safeParse(c.req.param('batchId'))
  const body = decisionSchema.safeParse(await safeJson(c))
  if (!batchId.success) return validationError(c, batchId.error)
  if (!body.success) return validationError(c, body.error)
  try { return c.json(await decideOperationBatch(c.env, c.get('identity'), batchId.data, 'reject', body.data.note)) }
  catch (error) { return domainError(c, error) }
})

app.post('/api/sources/:sourceId/decision', async (c) => {
  const sourceId = z.uuid().safeParse(c.req.param('sourceId'))
  const body = z.object({ decision: z.enum(['verified','rejected']), note: z.string().trim().max(500).optional() }).safeParse(await safeJson(c))
  if (!sourceId.success) return validationError(c, sourceId.error)
  if (!body.success) return validationError(c, body.error)
  const source = await c.env.DB.prepare(`SELECT id, state, notes FROM sources WHERE id = ? AND workspace_id = ?`).bind(sourceId.data, c.env.WORKSPACE_ID_SECRET).first<{ id: string; state: string; notes: string | null }>()
  if (!source) return apiError(c, 404, 'source_not_found', 'Fonte non trovata')
  if (source.state !== 'pending_review') return apiError(c, 409, 'source_already_decided', 'La fonte e gia stata valutata')
  if (body.data.decision === 'verified') {
    const blocking = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM data_quality_issues
      WHERE workspace_id = ? AND source_id = ? AND severity = 'blocking' AND state = 'open'`)
      .bind(c.env.WORKSPACE_ID_SECRET, sourceId.data).first<{ count: number }>()
    if (Number(blocking?.count ?? 0) > 0) {
      return apiError(c, 409, 'source_has_blocking_issues', 'Risolvi o rifiuta i problemi bloccanti prima di verificare la fonte')
    }
  }
  const now = isoNow()
  const sourceNotes = (() => { try { return JSON.parse(source.notes ?? '{}') as Record<string, unknown> } catch { return {} } })()
  const importedSource = body.data.decision === 'verified'
    ? await c.env.DB.prepare(`SELECT source_type FROM import_sources WHERE source_id = ? AND workspace_id = ?`).bind(sourceId.data, c.env.WORKSPACE_ID_SECRET).first<{ source_type: string }>()
    : null
  const supersedePriorSnapshot = Boolean(
    importedSource
      && ['health_workbook', 'apple_health_export'].includes(importedSource.source_type)
      && sourceNotes.import_mode !== 'incremental',
  )
  const supersessionStatements = supersedePriorSnapshot ? [
    c.env.DB.prepare(`UPDATE sources SET state = 'superseded', last_reviewed_at = ? WHERE workspace_id = ? AND id <> ? AND state = 'verified' AND id IN (SELECT source_id FROM import_sources WHERE workspace_id = ? AND source_type IN ('health_workbook','apple_health_export') AND state = 'verified')`).bind(now, c.env.WORKSPACE_ID_SECRET, sourceId.data, c.env.WORKSPACE_ID_SECRET),
    c.env.DB.prepare(`UPDATE import_sources SET state = 'superseded' WHERE workspace_id = ? AND source_id <> ? AND source_type IN ('health_workbook','apple_health_export') AND state = 'verified'`).bind(c.env.WORKSPACE_ID_SECRET, sourceId.data),
  ] : []
  await c.env.DB.batch([
    ...supersessionStatements,
    c.env.DB.prepare(`UPDATE sources SET state = ?, verified_at = ?, last_reviewed_at = ? WHERE id = ? AND workspace_id = ? AND state = 'pending_review'`).bind(body.data.decision, body.data.decision === 'verified' ? now : null, now, sourceId.data, c.env.WORKSPACE_ID_SECRET),
    c.env.DB.prepare(`UPDATE import_sources SET state = ?, verified_at = ? WHERE source_id = ? AND workspace_id = ? AND state = 'pending_review'`).bind(body.data.decision, body.data.decision === 'verified' ? now : null, sourceId.data, c.env.WORKSPACE_ID_SECRET),
    c.env.DB.prepare(`INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at) VALUES (?, ?, 'owner', ?, 'source', ?, ?, ?)`).bind(c.env.WORKSPACE_ID_SECRET, c.get('identity').actorId, `source.${body.data.decision}`, sourceId.data, JSON.stringify({ ...(body.data.note ? { note: body.data.note } : {}), superseded_prior_health_snapshot: supersedePriorSnapshot }), now),
  ])
  return c.json({ source_id: sourceId.data, state: body.data.decision })
})

app.get('/v1/context', async (c) => {
  const parsed = contextQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return validationError(c, parsed.error)
  await ensureWorkspace(c.env)
  const { domain, from, to, limit } = parsed.data
  if (domain === 'overview') {
    const dashboard = await getDashboard(c.env)
    const profile = dashboard.records
      .filter((row: any) => String(row.payload.category) === 'profile.constitution')
      .slice(0, Math.min(limit, 30))
      .map(minimizeDashboardRecord)
    return c.json({
      workspace_id: c.env.WORKSPACE_ID_SECRET,
      domain,
      pending: dashboard.pending.slice(0, Math.min(limit, 20)).map((row: any) => ({ id: row.id, source_label: row.source_label, risk_reason: row.risk_reason, created_at: row.created_at })),
      deadlines: dashboard.records.filter((row: any) => row.kind === 'deadline').slice(0, Math.min(limit, 30)),
      document_count: dashboard.documents.length,
      quality_issues: dashboard.quality_issues.slice(0, 20),
      brief: dashboard.brief,
      data_health: dashboard.data_health,
      profile,
    })
  }
  if (domain === 'insights') {
    const dashboard = await getDashboard(c.env)
    return c.json({ workspace_id: c.env.WORKSPACE_ID_SECRET, domain, reviews: dashboard.reviews, insights: dashboard.insights, data_health: dashboard.data_health, benefits: dashboard.benefits, monitors: dashboard.monitors })
  }
  const kinds = domainKinds(domain)
  const rows = (await queryOperationItems(c.env, kinds, from, to, Math.min(limit * 5, 500))).filter((row) => domainAllowsRecord(domain, row)).slice(0, limit)
  if (domain === 'documents') {
    const documents = await c.env.DB.prepare(`SELECT id, title, document_type, document_date, sensitivity, state, created_at FROM documents WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`).bind(c.env.WORKSPACE_ID_SECRET, limit).all()
    return c.json({ domain, records: documents.results })
  }
  if (domain === 'home') {
    const dashboard = await getDashboard(c.env)
    return c.json({ domain, records: rows.map(minimizeRecord), regulatory_rules: dashboard.regulatory_rules, benefits: dashboard.benefits, monitors: dashboard.monitors })
  }
  return c.json({ domain, records: rows.map(minimizeRecord) })
})

app.get('/v1/search', async (c) => {
  const parsed = searchQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return validationError(c, parsed.error)
  const where = [`workspace_id = ?`, `title LIKE ? ESCAPE '\\'`]
  const bindings: unknown[] = [c.env.WORKSPACE_ID_SECRET, `%${escapeLike(parsed.data.query)}%`]
  if (parsed.data.kind !== 'all') { where.push('kind = ?'); bindings.push(parsed.data.kind) }
  if (parsed.data.from) { where.push('effective_date >= ?'); bindings.push(parsed.data.from) }
  if (parsed.data.to) { where.push('effective_date <= ?'); bindings.push(parsed.data.to) }
  bindings.push(parsed.data.limit)
  const result = await c.env.DB.prepare(`SELECT id, kind, effective_date, state, title, confidence, evidence_status, supersedes_item_id, sensitivity, payload_json FROM operation_items WHERE ${where.join(' AND ')} ORDER BY effective_date DESC LIMIT ?`).bind(...bindings).all<Record<string, unknown> & { payload_json: string }>()
  return c.json({ records: result.results.map(minimizeRecord) })
})

app.post('/v1/operations/propose', async (c) => {
  const parsed = proposeOperationsSchema.safeParse(await safeJson(c))
  if (!parsed.success) return validationError(c, parsed.error)
  if (parsed.data.source === 'document_extraction' && detectPromptInjection(JSON.stringify(parsed.data.operations)).length) {
    return apiError(c, 422, 'document_instruction_detected', 'Il documento contiene testo simile a istruzioni: estrazione bloccata e revisione manuale richiesta')
  }
  try { return c.json(await proposeOperations(c.env, c.get('identity'), parsed.data), 201) }
  catch (error) { return domainError(c, error) }
})

app.post('/v1/operations/correct', async (c) => {
  const parsed = correctionSchema.safeParse(await safeJson(c))
  if (!parsed.success) return validationError(c, parsed.error)
  const replacement = { ...parsed.data.replacement, supersedes_item_id: parsed.data.original_item_id }
  const input = {
    workspace_id: parsed.data.workspace_id,
    idempotency_key: parsed.data.idempotency_key,
    source: 'direct_user_statement' as const,
    source_label: parsed.data.source_label ?? 'Correzione richiesta in chat',
    operations: [{ ...replacement, sensitivity: operationSensitivity(replacement) }],
  }
  try { return c.json(await proposeOperations(c.env, c.get('identity'), input), 201) }
  catch (error) { return domainError(c, error) }
})

app.post('/v1/upload-links', async (c) => {
  const body = z.object({ workspace_id: z.uuid(), sensitivity: z.enum(['normal','personal','financial','health','identity','highly_restricted']) }).safeParse(await safeJson(c))
  if (!body.success) return validationError(c, body.error)
  if (body.data.workspace_id !== c.env.WORKSPACE_ID_SECRET) return apiError(c, 403, 'workspace_mismatch', 'Workspace non autorizzato')
  const rawToken = randomToken()
  const tokenHash = await sha256Text(rawToken)
  const id = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  await c.env.DB.prepare(`INSERT INTO upload_grants (id, workspace_id, token_hash, intended_sensitivity, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, c.env.WORKSPACE_ID_SECRET, tokenHash, body.data.sensitivity, c.get('identity').actorId, expiresAt, isoNow()).run()
  await writeAudit(c.env, c.get('identity'), 'upload_link.created', 'upload_grant', id)
  return c.json({ upload_url: `${c.env.APP_ORIGIN}/upload#${rawToken}`, expires_at: expiresAt })
})

app.get('/v1/documents/:documentId/excerpt', async (c) => {
  const documentId = z.uuid().safeParse(c.req.param('documentId'))
  if (!documentId.success) return validationError(c, documentId.error)
  const row = await c.env.DB.prepare(`SELECT id, document_id, masked_text, page_labels_json, purpose, expires_at FROM document_excerpts WHERE document_id = ? AND workspace_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
    .bind(documentId.data, c.env.WORKSPACE_ID_SECRET, isoNow()).first<Record<string, unknown>>()
  if (!row) return apiError(c, 404, 'excerpt_not_authorized', 'Nessun estratto autorizzato attivo')
  const { page_labels_json, ...excerpt } = row
  return c.json({ ...excerpt, page_labels: JSON.parse(String(page_labels_json)) })
})

app.post('/api/upload-grants/verify', async (c) => {
  const body = z.object({ token_hash: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(await safeJson(c))
  if (!body.success) return validationError(c, body.error)
  const row = await c.env.DB.prepare(`SELECT id, workspace_id, intended_sensitivity FROM upload_grants WHERE token_hash = ? AND workspace_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`)
    .bind(body.data.token_hash, c.env.WORKSPACE_ID_SECRET, isoNow()).first<Record<string, unknown>>()
  if (!row) return apiError(c, 404, 'invalid_upload_grant', 'Link non valido, scaduto o gia utilizzato')
  return c.json(row)
})

app.post('/api/upload-grants/consume', async (c) => {
  const body = z.object({ token_hash: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(await safeJson(c))
  if (!body.success) return validationError(c, body.error)
  const result = await c.env.DB.prepare(`UPDATE upload_grants SET used_at = ? WHERE token_hash = ? AND workspace_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`)
    .bind(isoNow(), body.data.token_hash, c.env.WORKSPACE_ID_SECRET, isoNow()).run()
  if (!result.meta.changes) return apiError(c, 409, 'upload_grant_not_consumed', 'Link non valido o gia utilizzato')
  return c.json({ consumed: true })
})

app.post('/api/documents', async (c) => {
  const body = documentMetadataSchema.safeParse(await safeJson(c))
  if (!body.success) return validationError(c, body.error)
  if (body.data.workspace_id !== c.env.WORKSPACE_ID_SECRET) return apiError(c, 403, 'workspace_mismatch', 'Workspace non autorizzato')
  if (c.env.DOCUMENTS_ENABLED !== 'true' || !c.env.DOCUMENTS) return apiError(c, 503, 'storage_not_enabled', 'Archivio R2 non ancora abilitato')
  const interrupted = await c.env.DB.prepare(`SELECT id, state FROM documents WHERE workspace_id = ? AND content_sha256 = ?`)
    .bind(c.env.WORKSPACE_ID_SECRET, body.data.content_sha256).first<{ id: string; state: string }>()
  if (interrupted) {
    if (interrupted.state !== 'staged') return apiError(c, 409, 'duplicate_document', 'Un documento con lo stesso contenuto e gia archiviato')
    await c.env.DB.prepare(`UPDATE documents SET title = ?, document_type = ?, document_date = ?, sensitivity = ?, byte_count = ?, media_type = ?, encryption_metadata_json = ?, encrypted_content_sha256 = NULL, uploaded_by = ?, confirmed_at = NULL WHERE id = ? AND workspace_id = ? AND state = 'staged'`)
      .bind(body.data.title, body.data.document_type, body.data.document_date ?? null, body.data.sensitivity, body.data.byte_count, body.data.media_type, JSON.stringify(body.data.encryption_metadata), c.get('identity').actorId, interrupted.id, c.env.WORKSPACE_ID_SECRET).run()
    return c.json({ id: interrupted.id, title: body.data.title, state: 'staged', idempotent_replay: true })
  }
  const id = crypto.randomUUID()
  const objectKey = `${c.env.WORKSPACE_ID_SECRET}/documents/${id}.enc`
  try {
    await c.env.DB.prepare(`INSERT INTO documents
      (id, workspace_id, title, document_type, document_date, sensitivity, state, content_sha256, encrypted_object_key, byte_count, media_type, encryption_metadata_json, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'staged', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, c.env.WORKSPACE_ID_SECRET, body.data.title, body.data.document_type, body.data.document_date ?? null, body.data.sensitivity, body.data.content_sha256, objectKey, body.data.byte_count, body.data.media_type, JSON.stringify(body.data.encryption_metadata), c.get('identity').actorId, isoNow()).run()
    return c.json({ id, title: body.data.title, state: 'staged' }, 201)
  } catch (error) {
    if (String(error).includes('UNIQUE')) return apiError(c, 409, 'duplicate_document', 'Un documento con lo stesso contenuto e gia archiviato')
    throw error
  }
})

app.post('/api/documents/:documentId/content', async (c) => {
  if (c.env.DOCUMENTS_ENABLED !== 'true' || !c.env.DOCUMENTS) return apiError(c, 503, 'storage_not_enabled', 'Archivio R2 non ancora abilitato')
  const documentId = z.uuid().safeParse(c.req.param('documentId'))
  if (!documentId.success) return validationError(c, documentId.error)
  const contentLength = Number(c.req.header('content-length') ?? 0)
  if (!contentLength || contentLength > MAX_ENCRYPTED_FILE_BYTES) return apiError(c, 413, 'file_size_invalid', 'File cifrato vuoto o superiore a 25 MB')
  const encryptedHash = c.req.header('x-content-sha256')
  if (!encryptedHash?.match(/^[0-9a-f]{64}$/)) return apiError(c, 400, 'encrypted_hash_required', 'Hash SHA-256 del contenuto cifrato richiesto')
  const document = await c.env.DB.prepare(`SELECT id, title, document_type, workspace_id, encrypted_object_key, byte_count, content_sha256, state FROM documents WHERE id = ? AND workspace_id = ?`)
    .bind(documentId.data, c.env.WORKSPACE_ID_SECRET).first<Record<string, unknown>>()
  if (!document) return apiError(c, 404, 'document_not_found', 'Documento non trovato')
  if (document.state !== 'staged') return apiError(c, 409, 'document_not_staged', 'Documento gia archiviato o non caricabile')
  if (Number(document.byte_count) !== contentLength) return apiError(c, 409, 'file_size_mismatch', 'Dimensione del file diversa dai metadati')
  const encryptedBytes = await c.req.arrayBuffer()
  if (await sha256Bytes(encryptedBytes) !== encryptedHash) return apiError(c, 409, 'encrypted_hash_mismatch', 'Integrita del contenuto cifrato non verificata')
  await c.env.DOCUMENTS.put(String(document.encrypted_object_key), encryptedBytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { documentId: String(document.id), encryptedHash },
  })
  const now = isoNow()
  const sourceId = crypto.randomUUID()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE documents SET state = 'confirmed', encrypted_content_sha256 = ?, confirmed_at = ? WHERE id = ? AND workspace_id = ? AND state = 'staged'`).bind(encryptedHash, now, documentId.data, c.env.WORKSPACE_ID_SECRET),
    c.env.DB.prepare(`INSERT INTO sources (id, workspace_id, source_type, label, original_document_id, source_sha256, reliability, state, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'user_confirmed', 'pending_review', ?, ?)`).bind(sourceId, c.env.WORKSPACE_ID_SECRET, sourceTypeForDocument(String(document.document_type ?? 'document')), String(document.title), documentId.data, String(document.content_sha256), c.get('identity').actorId, now),
    c.env.DB.prepare(`INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at) VALUES (?, ?, 'owner', 'document.uploaded', 'document', ?, ?, ?)`).bind(c.env.WORKSPACE_ID_SECRET, c.get('identity').actorId, documentId.data, JSON.stringify({ source_id: sourceId }), now),
  ])
  return c.json({ document_id: documentId.data, source_id: sourceId, stored: true, source_review_required: true })
})

app.get('/api/documents/:documentId/content', async (c) => {
  if (c.env.DOCUMENTS_ENABLED !== 'true' || !c.env.DOCUMENTS) return apiError(c, 503, 'storage_not_enabled', 'Archivio R2 non ancora abilitato')
  const documentId = z.uuid().safeParse(c.req.param('documentId'))
  if (!documentId.success) return validationError(c, documentId.error)
  const document = await c.env.DB.prepare(`SELECT id, title, media_type, encrypted_object_key, byte_count, content_sha256, encrypted_content_sha256, encryption_metadata_json, state FROM documents WHERE id = ? AND workspace_id = ?`)
    .bind(documentId.data, c.env.WORKSPACE_ID_SECRET).first<Record<string, unknown>>()
  if (!document || document.state !== 'confirmed') return apiError(c, 404, 'document_not_found', 'Documento confermato non trovato')
  const object = await c.env.DOCUMENTS.get(String(document.encrypted_object_key))
  if (!object || object.size !== Number(document.byte_count)) return apiError(c, 409, 'document_object_mismatch', 'Oggetto cifrato assente o di dimensione incoerente')
  const encryptedHash = String(document.encrypted_content_sha256)
  if (object.customMetadata?.encryptedHash !== encryptedHash) return apiError(c, 409, 'document_hash_mismatch', 'Metadati di integrita non coerenti')
  await writeAudit(c.env, c.get('identity'), 'document.downloaded', 'document', documentId.data)
  return new Response(object.body, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(object.size),
      'Content-Disposition': `attachment; filename="${documentId.data}.enc"`,
      'X-Content-Sha256': encryptedHash,
      'X-Plaintext-Sha256': String(document.content_sha256),
      'X-Original-Media-Type': String(document.media_type || 'application/octet-stream'),
      'X-Encryption-Metadata': encodeBase64(new TextEncoder().encode(String(document.encryption_metadata_json))),
    },
  })
})

app.post('/api/documents/:documentId/excerpts', async (c) => {
  const documentId = z.uuid().safeParse(c.req.param('documentId'))
  const body = excerptSchema.safeParse(await safeJson(c))
  if (!documentId.success) return validationError(c, documentId.error)
  if (!body.success) return validationError(c, body.error)
  if (body.data.workspace_id !== c.env.WORKSPACE_ID_SECRET) return apiError(c, 403, 'workspace_mismatch', 'Workspace non autorizzato')
  if (detectPromptInjection(body.data.masked_text).length) return apiError(c, 422, 'document_instruction_detected', 'Estratto contenente istruzioni sospette: autorizzazione negata')
  const document = await c.env.DB.prepare('SELECT id FROM documents WHERE id = ? AND workspace_id = ? AND state = ?').bind(documentId.data, c.env.WORKSPACE_ID_SECRET, 'confirmed').first()
  if (!document) return apiError(c, 404, 'document_not_found', 'Documento confermato non trovato')
  const id = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + body.data.ttl_minutes * 60_000).toISOString()
  await c.env.DB.prepare(`INSERT INTO document_excerpts (id, workspace_id, document_id, created_by, masked_text, page_labels_json, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, c.env.WORKSPACE_ID_SECRET, documentId.data, c.get('identity').actorId, body.data.masked_text, JSON.stringify(body.data.page_labels ?? []), body.data.purpose, expiresAt, isoNow()).run()
  await writeAudit(c.env, c.get('identity'), 'document.excerpt_authorized', 'document_excerpt', id, { document_id: documentId.data, expires_at: expiresAt })
  return c.json({ id, document_id: documentId.data, purpose: body.data.purpose, expires_at: expiresAt }, 201)
})

app.post('/api/imports/health/start', async (c) => {
  const body = healthImportStartSchema.safeParse(await safeJson(c))
  if (!body.success) return validationError(c, body.error)
  if (body.data.workspace_id !== c.env.WORKSPACE_ID_SECRET) return apiError(c, 403, 'workspace_mismatch', 'Workspace non autorizzato')
  const importDigest = body.data.artifact_sha256 ?? body.data.source_sha256
  const existing = await c.env.DB.prepare('SELECT id, source_id, state FROM import_sources WHERE workspace_id = ? AND source_sha256 = ?').bind(c.env.WORKSPACE_ID_SECRET, importDigest).first<Record<string, unknown>>()
  if (existing) return c.json({ import_id: existing.id, source_id: existing.source_id, state: existing.state, idempotent_replay: true })
  const importId = crypto.randomUUID()
  const sourceId = crypto.randomUUID()
  const now = isoNow()
  const sourceNotes = JSON.stringify({
    state: 'staged_pending_review',
    artifact_name: body.data.artifact_name ?? null,
    artifact_sha256: body.data.artifact_sha256 ?? null,
    upstream_record_count: body.data.upstream_record_count ?? null,
    transformation: body.data.transformation ?? null,
    validation: body.data.validation ?? 'pending',
    import_mode: body.data.import_mode ?? 'snapshot',
    upstream_source_sha256: body.data.source_sha256,
  })
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO sources (id, workspace_id, source_type, provider, label, source_sha256, coverage_start, coverage_end, source_date, reliability, state, expected_refresh_days, created_by, created_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?)`)
      .bind(sourceId, c.env.WORKSPACE_ID_SECRET, body.data.source_type === 'apple_health_export' ? 'apple_health_export' : 'import_package', body.data.source_type === 'apple_health_export' ? 'Apple' : null, body.data.source_name, importDigest, body.data.coverage_start ?? null, body.data.coverage_end ?? null, body.data.exported_at?.slice(0, 10) ?? null, body.data.source_type === 'apple_health_export' && body.data.validation === 'reconciled' ? 'primary_authoritative' : 'user_confirmed', body.data.source_type === 'apple_health_export' ? 45 : 180, c.get('identity').actorId, now, sourceNotes),
    c.env.DB.prepare(`INSERT INTO import_sources (id, workspace_id, source_id, source_type, source_name, source_sha256, schema_version, state, expected_counts_json, actual_counts_json, imported_by, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'staged', ?, '{}', ?, ?)`)
      .bind(importId, c.env.WORKSPACE_ID_SECRET, sourceId, body.data.source_type, body.data.source_name, importDigest, body.data.schema_version, JSON.stringify(body.data.expected_counts), c.get('identity').actorId, now),
    c.env.DB.prepare(`INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at) VALUES (?, ?, 'owner', 'import.staged', 'import_source', ?, ?, ?)`)
      .bind(c.env.WORKSPACE_ID_SECRET, c.get('identity').actorId, importId, JSON.stringify({ source_id: sourceId }), now),
  ])
  return c.json({ import_id: importId, source_id: sourceId, state: 'staged' }, 201)
})

app.post('/api/imports/health/:importId/chunk', async (c) => {
  const importId = z.uuid().safeParse(c.req.param('importId'))
  const body = healthChunkEnvelope.safeParse(await safeJson(c, 512 * 1024))
  if (!importId.success) return validationError(c, importId.error)
  if (!body.success) return validationError(c, body.error)
  const source = await c.env.DB.prepare(`SELECT id FROM import_sources WHERE id = ? AND workspace_id = ? AND state = 'staged'`).bind(importId.data, c.env.WORKSPACE_ID_SECRET).first()
  if (!source) return apiError(c, 409, 'import_not_staged', 'Import non disponibile per il caricamento')
  try {
    const statements = healthChunkStatements(c.env, importId.data, body.data.table, body.data.rows)
    if (statements.length) await c.env.DB.batch(statements)
    return c.json({ accepted: body.data.rows.length, table: body.data.table })
  } catch (error) {
    return domainError(c, error)
  }
})

app.post('/api/imports/health/:importId/complete', async (c) => {
  const importId = z.uuid().safeParse(c.req.param('importId'))
  if (!importId.success) return validationError(c, importId.error)
  const source = await c.env.DB.prepare(`SELECT id, source_id, expected_counts_json, state FROM import_sources WHERE id = ? AND workspace_id = ?`).bind(importId.data, c.env.WORKSPACE_ID_SECRET).first<Record<string, unknown>>()
  if (!source || source.state !== 'staged') return apiError(c, 409, 'import_not_staged', 'Import non disponibile per il completamento')
  const [daily, sleep, workouts] = await Promise.all([
    countRows(c.env, 'health_daily_metrics', importId.data), countRows(c.env, 'sleep_sessions', importId.data), countRows(c.env, 'workout_sessions', importId.data),
  ])
  const actual = { daily_metrics: daily, sleep, workouts }
  const expected = JSON.parse(String(source.expected_counts_json)) as Record<string, number>
  const matches = Object.entries(actual).every(([key, value]) => Number(expected[key] ?? value) === value)
  const now = isoNow()
  const statements = [
    c.env.DB.prepare(`UPDATE import_sources SET state = 'pending_review', actual_counts_json = ? WHERE id = ? AND workspace_id = ? AND state = 'staged'`).bind(JSON.stringify(actual), importId.data, c.env.WORKSPACE_ID_SECRET),
    c.env.DB.prepare(`INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at) VALUES (?, ?, 'owner', 'import.pending_review', 'import_source', ?, ?, ?)`).bind(c.env.WORKSPACE_ID_SECRET, c.get('identity').actorId, importId.data, JSON.stringify({ expected, actual, counts_match: matches }), now),
  ]
  if (!matches) statements.push(c.env.DB.prepare(`INSERT INTO data_quality_issues (id, workspace_id, source_id, severity, code, message, state, created_at) VALUES (?, ?, ?, 'blocking', 'import_count_mismatch', ?, 'open', ?)`).bind(crypto.randomUUID(), c.env.WORKSPACE_ID_SECRET, String(source.source_id), `Conteggi import non coerenti. Attesi ${JSON.stringify(expected)}, ricevuti ${JSON.stringify(actual)}`, now))
  await c.env.DB.batch(statements)
  return c.json({ import_id: importId.data, source_id: source.source_id, state: 'pending_review', expected_counts: expected, actual_counts: actual, counts_match: matches, canonical: false })
})

app.post('/api/calendar/connect', async (c) => {
  if (c.env.GOOGLE_CALENDAR_ENABLED !== 'true') return apiError(c, 503, 'calendar_not_configured', 'Google Calendar non ancora configurato')
  const body = workspaceOnlySchema.safeParse(await safeJson(c))
  if (!body.success) return validationError(c, body.error)
  if (body.data.workspace_id !== c.env.WORKSPACE_ID_SECRET) return apiError(c, 403, 'workspace_mismatch', 'Workspace non autorizzato')
  const rawState = randomToken()
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
  await c.env.DB.prepare(`INSERT INTO google_calendar_oauth_states (state_hash, workspace_id, user_email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(await sha256Text(rawState), c.env.WORKSPACE_ID_SECRET, c.get('identity').email, expiresAt, isoNow()).run()
  const redirectUri = `${new URL(c.req.url).origin}/oauth/google-calendar/callback`
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorize.search = new URLSearchParams({ client_id: c.env.GOOGLE_OAUTH_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: GOOGLE_CALENDAR_SCOPE, access_type: 'offline', include_granted_scopes: 'false', prompt: 'consent', state: rawState }).toString()
  return c.json({ authorize_url: authorize.toString(), expires_at: expiresAt })
})

app.get('/oauth/google-calendar/callback', requireOwner, async (c) => {
  if (c.env.GOOGLE_CALENDAR_ENABLED !== 'true') return c.redirect(`${c.env.APP_ORIGIN}/?calendar=disabled`)
  const query = z.object({ code: z.string().min(8).optional(), state: z.string().min(32).optional(), error: z.string().optional() }).safeParse(c.req.query())
  if (!query.success || query.data.error || !query.data.code || !query.data.state) return c.redirect(`${c.env.APP_ORIGIN}/?calendar=denied`)
  const stateHash = await sha256Text(query.data.state)
  const now = isoNow()
  const grant = await c.env.DB.prepare(`UPDATE google_calendar_oauth_states SET consumed_at = ? WHERE state_hash = ? AND workspace_id = ? AND consumed_at IS NULL AND expires_at > ? RETURNING workspace_id, user_email`)
    .bind(now, stateHash, c.env.WORKSPACE_ID_SECRET, now).first<{ workspace_id: string; user_email: string }>()
  if (!grant || grant.user_email.toLowerCase() !== c.env.OWNER_EMAIL_SECRET.toLowerCase()) return c.redirect(`${c.env.APP_ORIGIN}/?calendar=invalid_state`)
  try {
    const redirectUri = `${new URL(c.req.url).origin}/oauth/google-calendar/callback`
    const tokens = await exchangeGoogleAuthorizationCode(c.env, query.data.code, redirectUri)
    if (!tokens.refresh_token) throw new Error('missing_refresh_token')
    const encrypted = await encryptSecret(tokens.refresh_token, c.env.GOOGLE_CALENDAR_TOKEN_KEY)
    await c.env.DB.prepare(`INSERT INTO google_calendar_connections
      (workspace_id, user_email, calendar_id, timezone, scope, state, encrypted_refresh_token, connected_at, revoked_at, error_code)
      VALUES (?, ?, 'primary', 'Europe/Rome', ?, 'connected', ?, ?, NULL, NULL)
      ON CONFLICT(workspace_id) DO UPDATE SET user_email = excluded.user_email, state = 'connected', encrypted_refresh_token = excluded.encrypted_refresh_token, connected_at = excluded.connected_at, revoked_at = NULL, error_code = NULL`)
      .bind(c.env.WORKSPACE_ID_SECRET, grant.user_email, GOOGLE_CALENDAR_SCOPE, encrypted, now).run()
    await writeAudit(c.env, c.get('identity'), 'calendar.connected', 'calendar_connection', c.env.WORKSPACE_ID_SECRET)
    return c.redirect(`${c.env.APP_ORIGIN}/?calendar=connected`)
  } catch {
    return c.redirect(`${c.env.APP_ORIGIN}/?calendar=failed`)
  }
})

app.post('/api/calendar/sync', async (c) => {
  const body = workspaceOnlySchema.safeParse(await safeJson(c))
  if (!body.success) return validationError(c, body.error)
  if (body.data.workspace_id !== c.env.WORKSPACE_ID_SECRET) return apiError(c, 403, 'workspace_mismatch', 'Workspace non autorizzato')
  try { return c.json(await syncGoogleCalendar(c.env, c.get('identity'))) }
  catch { return apiError(c, 502, 'calendar_sync_failed', 'Sincronizzazione non completata; nessun dato evento e stato inserito nei log') }
})

app.post('/api/calendar/disconnect', async (c) => {
  const body = workspaceOnlySchema.safeParse(await safeJson(c))
  if (!body.success) return validationError(c, body.error)
  if (body.data.workspace_id !== c.env.WORKSPACE_ID_SECRET) return apiError(c, 403, 'workspace_mismatch', 'Workspace non autorizzato')
  const connection = await c.env.DB.prepare(`SELECT encrypted_refresh_token FROM google_calendar_connections WHERE workspace_id = ? AND state = 'connected'`).bind(c.env.WORKSPACE_ID_SECRET).first<{ encrypted_refresh_token: string }>()
  if (connection?.encrypted_refresh_token) {
    try {
      const refreshToken = await decryptSecret(connection.encrypted_refresh_token, c.env.GOOGLE_CALENDAR_TOKEN_KEY)
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    } catch { /* The local credential is removed even if Google is unavailable. */ }
  }
  await c.env.DB.prepare(`UPDATE google_calendar_connections SET state = 'revoked', encrypted_refresh_token = NULL, revoked_at = ?, error_code = NULL WHERE workspace_id = ?`).bind(isoNow(), c.env.WORKSPACE_ID_SECRET).run()
  await writeAudit(c.env, c.get('identity'), 'calendar.disconnected', 'calendar_connection', c.env.WORKSPACE_ID_SECRET)
  return c.json({ disconnected: true })
})

app.post('/api/backups/run', async (c) => {
  if (c.env.BACKUPS_ENABLED !== 'true' || !c.env.BACKUPS) return apiError(c, 503, 'backups_not_configured', 'Backup R2 non ancora configurato')
  try {
    const result = await createEncryptedBackup(c.env)
    if (result.state !== 'completed' || !result.backup_id) throw new Error('backup_not_completed')
    await writeAudit(c.env, c.get('identity'), 'backup.created', 'backup_run', result.backup_id)
    return c.json(result)
  } catch {
    return apiError(c, 502, 'backup_failed', 'Backup non completato; i dati canonici non sono stati modificati')
  }
})

app.post('/api/backups/:backupId/verify', async (c) => {
  if (c.env.BACKUPS_ENABLED !== 'true' || !c.env.BACKUPS) return apiError(c, 503, 'backups_not_configured', 'Backup R2 non ancora configurato')
  const backupId = z.uuid().safeParse(c.req.param('backupId'))
  if (!backupId.success) return validationError(c, backupId.error)
  try {
    const result = await verifyEncryptedBackup(c.env, backupId.data)
    await writeAudit(c.env, c.get('identity'), 'backup.verified', 'backup_run', backupId.data, { table_count: result.table_count })
    return c.json(result)
  } catch {
    return apiError(c, 409, 'backup_verification_failed', 'Il backup non supera il controllo di decifratura e conteggi')
  }
})

app.notFound(async (c) => {
  const pathname = new URL(c.req.url).pathname
  if (pathname.startsWith('/api/') || pathname.startsWith('/v1/') || pathname.startsWith('/oauth/')) return apiError(c, 404, 'not_found', 'Endpoint non trovato')
  if (c.get('identity')?.actorType !== 'owner') return apiError(c, 403, 'owner_required', 'La PWA e disponibile solo all account proprietario')
  let response = await c.env.ASSETS.fetch(c.req.raw)
  if (response.status === 404 && c.req.header('accept')?.includes('text/html')) {
    response = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url), c.req.raw))
  }
  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  headers.set('Cache-Control', pathname === '/' || pathname.endsWith('.html') ? 'private, no-store' : 'private, max-age=86400')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
})

app.onError((error, c) => {
  if (error instanceof Error && error.message === 'request_too_large') {
    return apiError(c, 413, 'request_too_large', 'Richiesta troppo grande')
  }
  console.error(JSON.stringify({ request_id: c.get('requestId'), error_code: sanitizeLogValue(error).slice(0, 120) }))
  return apiError(c, 500, 'internal_error', 'Operazione non completata')
})

function rateLimit(group: string) {
  return async (c: any, next: () => Promise<void>) => {
    let permitted: boolean
    try {
      const identity = c.get('identity') as AccessIdentity
      const policy = rateLimitPolicy(group, identity.actorType, new URL(c.req.url).pathname)
      permitted = await enforceRateLimit(c.env, identity, policy.group, policy.maximum)
    } catch { return apiError(c, 503, 'authorization_check_failed', 'Controllo autorizzazione non disponibile') }
    if (!permitted) return apiError(c, 429, 'rate_limited', 'Troppe richieste; riprova tra un minuto')
    await next()
  }
}

function apiError(c: any, status: number, code: string, message: string) {
  return c.json({ error: { code, message, request_id: c.get('requestId') } }, status)
}

function validationError(c: any, error: z.ZodError) {
  return apiError(c, 400, 'validation_error', error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ').slice(0, 500))
}

function domainError(c: any, error: unknown) {
  const code = error instanceof Error ? error.message : 'database_rejected'
  const messages: Record<string, string> = {
    workspace_mismatch: 'Workspace non autorizzato', source_not_found: 'Fonte non trovata', source_not_verified: 'Verifica prima la fonte associata',
    invalid_superseded_record: 'La versione da correggere non e valida', superseded_record_changed: 'La versione originale e cambiata; ricarica la proposta',
    batch_not_found: 'Proposta non trovata', batch_already_decided: 'Proposta gia valutata', batch_empty: 'Proposta priva di elementi',
    invalid_health_chunk: 'Righe sanitarie non valide',
    benefit_source_required: 'Un bonus richiede chiave stabile e fonte ufficiale HTTPS',
    regulatory_source_required: 'Una regola richiede chiave stabile e fonte ufficiale HTTPS',
  }
  return apiError(c, code.endsWith('not_found') ? 404 : 409, code, messages[code] ?? 'Operazione rifiutata per proteggere la coerenza dei dati')
}

async function safeJson(c: any, maximumBytes = 128 * 1024) {
  const contentLength = Number(c.req.header('content-length') ?? 0)
  if (contentLength > maximumBytes) throw new Error('request_too_large')
  const text = await c.req.text()
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error('request_too_large')
  try { return JSON.parse(text) } catch { return null }
}

function domainKinds(domain: z.infer<typeof contextQuerySchema>['domain']) {
  if (domain === 'finance') return ['investment','account_balance','financial_snapshot','asset_valuation','liability_snapshot','mortgage_snapshot','pension_snapshot','insurance_policy','transaction','recurring_commitment','budget_target','fact']
  if (domain === 'health') return ['measurement','lab_result','medication','diagnosis','vaccination','appointment','fact','event']
  if (domain === 'home') return ['utility_bill','insurance_policy','recurring_commitment','deadline','fact','event','asset_valuation']
  if (domain === 'deadlines') return ['deadline','appointment','event']
  if (domain === 'profile') return ['fact']
  return []
}

function domainAllowsRecord(domain: z.infer<typeof contextQuerySchema>['domain'], row: Record<string, unknown> & { payload_json?: string }) {
  if (!['profile','finance','health','home'].includes(domain)) return true
  let category = ''
  try { category = String(JSON.parse(String(row.payload_json || '{}')).category || '') } catch { return false }
  if (domain === 'profile') return category === 'profile.constitution'
  if (domain === 'finance' && String(row.kind) === 'fact') return ['portfolio.position','portfolio.exposure','portfolio.performance','isee.input','isee.estimate','isee.result'].includes(category)
  if (domain === 'health' && ['fact','event'].includes(String(row.kind))) return ['check_in','nutrition.meal','health.profile','health.target','health.ecg','health.route'].includes(category)
  if (domain === 'home' && ['fact','event'].includes(String(row.kind))) return ['maintenance','warranty','mobility','property.registry','vehicle.profile','vehicle.cost','vehicle.valuation'].includes(category)
  return true
}

function minimizeDashboardRecord(row: Record<string, unknown>) {
  const result: Record<string, unknown> = {
    id: row.id,
    kind: row.kind,
    effective_date: row.effective_date,
    state: row.state,
    title: row.title,
    confidence: row.confidence,
    evidence_status: row.evidence_status,
    supersedes_item_id: row.supersedes_item_id,
  }
  if (!['identity', 'highly_restricted'].includes(String(row.sensitivity))) result.payload = row.payload
  return result
}

async function queryOperationItems(env: Env, kinds: string[], from: string | undefined, to: string | undefined, limit: number) {
  if (!kinds.length) return []
  const placeholders = kinds.map(() => '?').join(',')
  const where = [`workspace_id = ?`, `state IN ('confirmed','proposed')`, `kind IN (${placeholders})`]
  const bindings: unknown[] = [env.WORKSPACE_ID_SECRET, ...kinds]
  if (from) { where.push('effective_date >= ?'); bindings.push(from) }
  if (to) { where.push('effective_date <= ?'); bindings.push(to) }
  bindings.push(limit)
  const result = await env.DB.prepare(`SELECT id, kind, effective_date, state, title, confidence, evidence_status, supersedes_item_id, sensitivity, payload_json FROM operation_items WHERE ${where.join(' AND ')} ORDER BY effective_date DESC LIMIT ?`).bind(...bindings).all<Record<string, unknown> & { payload_json: string }>()
  return result.results
}

function escapeLike(value: string) { return value.replace(/[\\%_]/g, '\\$&') }
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function sourceTypeForDocument(documentType: string) {
  if (documentType === 'utility_bill') return 'utility_invoice'
  if (documentType === 'medical_report') return 'medical_report'
  if (documentType === 'lab_report') return 'lab_report'
  if (documentType === 'receipt') return 'receipt'
  if (documentType === 'bank_statement') return 'bank_statement'
  if (documentType === 'investment_statement') return 'investment_statement'
  if (documentType === 'loan_statement') return 'loan_statement'
  if (documentType === 'insurance_policy') return 'insurer_document'
  if (documentType === 'tax_document') return 'tax_document'
  return 'other'
}
async function sha256Text(value: string) { return sha256Bytes(new TextEncoder().encode(value)) }
async function sha256Bytes(value: BufferSource) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map((part) => part.toString(16).padStart(2, '0')).join('') }

const documentMetadataSchema = z.object({
  workspace_id: z.uuid(), title: z.string().trim().min(1).max(200), document_type: z.string().trim().min(1).max(80), document_date: z.iso.date().optional(),
  sensitivity: z.enum(['normal','personal','financial','health','identity','highly_restricted']), content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byte_count: z.number().int().positive().max(MAX_ENCRYPTED_FILE_BYTES), media_type: z.string().trim().min(1).max(120), encryption_metadata: z.record(z.string(), z.unknown()),
})
const excerptSchema = z.object({ workspace_id: z.uuid(), masked_text: z.string().trim().min(1).max(12000), page_labels: z.array(z.string().max(20)).max(30).optional(), purpose: z.string().trim().min(1).max(200), ttl_minutes: z.number().int().min(5).max(1440).default(60) })
const workspaceOnlySchema = z.object({ workspace_id: z.uuid() })
const healthImportStartSchema = z.object({
  workspace_id: z.uuid(), source_type: z.enum(['health_workbook','apple_health_export']), source_name: z.string().trim().min(1).max(255),
  source_sha256: z.string().regex(/^[0-9a-f]{64}$/), schema_version: z.string().trim().min(1).max(80),
  artifact_name: z.string().trim().min(1).max(255).optional(), artifact_sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  exported_at: z.string().max(64).nullish(), upstream_record_count: z.number().int().nonnegative().max(10_000_000).nullish(),
  coverage_start: z.iso.date().nullish(), coverage_end: z.iso.date().nullish(), transformation: z.string().trim().min(1).max(100).optional(),
  validation: z.enum(['pending','reconciled']).optional(),
  import_mode: z.enum(['snapshot','incremental']).default('snapshot'),
  expected_counts: z.object({ daily_metrics: z.number().int().min(0).max(100000), sleep: z.number().int().min(0).max(10000), workouts: z.number().int().min(0).max(10000) }),
})
const healthChunkEnvelope = z.object({ table: z.enum(['daily_metrics','sleep','workouts']), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(100) })
const nullableNumber = z.number().finite().nullable().optional()
const dailyMetricSchema = z.object({ observed_on: z.iso.date(), metric_key: z.string().regex(/^[a-z0-9]+([._][a-z0-9]+)*$/), source_label: z.string().trim().min(1).max(160), unit: z.string().trim().min(1).max(24), record_count: z.number().int().min(0).nullable().optional(), value_sum: nullableNumber, value_avg: nullableNumber, value_min: nullableNumber, value_max: nullableNumber, value_first: nullableNumber, value_last: nullableNumber }).strict()
const sleepSchema = z.object({ observed_on: z.iso.date(), detected_hours: nullableNumber, valid_hours: nullableNumber, efficiency: z.number().min(0).max(1).nullable().optional(), core_minutes: nullableNumber, deep_minutes: nullableNumber, rem_minutes: nullableNumber, awake_minutes: nullableNumber, source_status: z.string().max(120).nullable().optional() }).strict()
const workoutSchema = z.object({ observed_on: z.iso.date(), activity_type: z.string().trim().min(1).max(120), duration_minutes: nullableNumber, distance_km: nullableNumber, energy_kcal: nullableNumber, average_heart_rate: nullableNumber, maximum_heart_rate: nullableNumber, running_speed_kmh: nullableNumber, route_file_name: z.string().max(255).nullable().optional(), source_label: z.string().max(160).nullable().optional(), source_row: z.number().int().min(0) }).strict()

function healthChunkStatements(env: Env, importId: string, table: 'daily_metrics' | 'sleep' | 'workouts', rows: Array<Record<string, unknown>>) {
  if (table === 'daily_metrics') return rows.map((value) => {
    const row = dailyMetricSchema.parse(value)
    return env.DB.prepare(`INSERT OR IGNORE INTO health_daily_metrics (id, workspace_id, import_source_id, observed_on, metric_key, source_label, unit, record_count, value_sum, value_avg, value_min, value_max, value_first, value_last, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), env.WORKSPACE_ID_SECRET, importId, row.observed_on, row.metric_key, row.source_label, row.unit, row.record_count ?? null, row.value_sum ?? null, row.value_avg ?? null, row.value_min ?? null, row.value_max ?? null, row.value_first ?? null, row.value_last ?? null, isoNow())
  })
  if (table === 'sleep') return rows.map((value) => {
    const row = sleepSchema.parse(value)
    return env.DB.prepare(`INSERT OR IGNORE INTO sleep_sessions (id, workspace_id, import_source_id, observed_on, detected_hours, valid_hours, efficiency, core_minutes, deep_minutes, rem_minutes, awake_minutes, source_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), env.WORKSPACE_ID_SECRET, importId, row.observed_on, row.detected_hours ?? null, row.valid_hours ?? null, row.efficiency ?? null, row.core_minutes ?? null, row.deep_minutes ?? null, row.rem_minutes ?? null, row.awake_minutes ?? null, row.source_status ?? null, isoNow())
  })
  return rows.map((value) => {
    const row = workoutSchema.parse(value)
    return env.DB.prepare(`INSERT OR IGNORE INTO workout_sessions (id, workspace_id, import_source_id, observed_on, activity_type, duration_minutes, distance_km, energy_kcal, average_heart_rate, maximum_heart_rate, running_speed_kmh, route_file_name, source_label, source_row, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), env.WORKSPACE_ID_SECRET, importId, row.observed_on, row.activity_type, row.duration_minutes ?? null, row.distance_km ?? null, row.energy_kcal ?? null, row.average_heart_rate ?? null, row.maximum_heart_rate ?? null, row.running_speed_kmh ?? null, row.route_file_name ?? null, row.source_label ?? null, row.source_row, isoNow())
  })
}

async function countRows(env: Env, table: 'health_daily_metrics' | 'sleep_sessions' | 'workout_sessions', importId: string) {
  const row = await env.DB.prepare(`SELECT count(*) AS count FROM ${table} WHERE workspace_id = ? AND import_source_id = ?`).bind(env.WORKSPACE_ID_SECRET, importId).first<{ count: number }>()
  return Number(row?.count ?? 0)
}

async function exchangeGoogleAuthorizationCode(env: Env, code: string, redirectUri: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }) })
  if (!response.ok) throw new Error('authorization_exchange_failed')
  return z.object({ access_token: z.string(), refresh_token: z.string().optional() }).parse(await response.json())
}

async function refreshGoogleAccessToken(env: Env, refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, grant_type: 'refresh_token' }) })
  if (!response.ok) throw new Error('refresh_failed')
  return z.object({ access_token: z.string() }).parse(await response.json()).access_token
}

async function syncGoogleCalendar(env: Env, identity: AccessIdentity | { actorId: string; actorType: 'system' }) {
  if (env.GOOGLE_CALENDAR_ENABLED !== 'true') throw new Error('calendar_disabled')
  const connection = await env.DB.prepare(`SELECT calendar_id, timezone, encrypted_refresh_token FROM google_calendar_connections WHERE workspace_id = ? AND state = 'connected'`).bind(env.WORKSPACE_ID_SECRET).first<{ calendar_id: string; timezone: string; encrypted_refresh_token: string }>()
  if (!connection?.encrypted_refresh_token) throw new Error('calendar_secret_missing')
  const accessToken = await refreshGoogleAccessToken(env, await decryptSecret(connection.encrypted_refresh_token, env.GOOGLE_CALENDAR_TOKEN_KEY))
  const [deadlineRows, syncRows] = await Promise.all([
    env.DB.prepare(`SELECT id, title, payload_json FROM operation_items WHERE workspace_id = ? AND kind = 'deadline' AND state = 'confirmed' ORDER BY effective_date LIMIT 250`).bind(env.WORKSPACE_ID_SECRET).all<{ id: string; title: string; payload_json: string }>(),
    env.DB.prepare(`SELECT operation_item_id, google_event_id FROM google_calendar_sync_items WHERE workspace_id = ?`).bind(env.WORKSPACE_ID_SECRET).all<{ operation_item_id: string; google_event_id: string | null }>(),
  ])
  const existing = new Map(syncRows.results.map((row) => [row.operation_item_id, row.google_event_id]))
  let synchronized = 0
  for (const row of deadlineRows.results) {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>
    if (String(payload.status ?? 'open') !== 'open' || !payload.due_at) continue
    const eventId = existing.get(row.id)
    const startedAt = new Date(String(payload.due_at))
    const endedAt = new Date(startedAt.getTime() + 30 * 60_000)
    const days = Array.isArray(payload.remind_days_before) ? payload.remind_days_before.map(Number).filter(Number.isFinite) : []
    const reminders = days.slice(0, 5).map((value) => ({ method: 'popup', minutes: Math.max(0, Math.min(value, 28)) * 1440 }))
    const event = { summary: row.title, description: 'Scadenza confermata in Personal OS', visibility: 'private', transparency: 'transparent', start: { dateTime: startedAt.toISOString(), timeZone: connection.timezone }, end: { dateTime: endedAt.toISOString(), timeZone: connection.timezone }, reminders: { useDefault: reminders.length === 0, overrides: reminders }, extendedProperties: { private: { personalOsOperationItemId: row.id } } }
    const calendarId = encodeURIComponent(connection.calendar_id)
    const url = eventId ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}` : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`
    const response = await fetch(url, { method: eventId ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event) })
    const now = isoNow()
    if (!response.ok) {
      await env.DB.prepare(`INSERT INTO google_calendar_sync_items (workspace_id, operation_item_id, google_event_id, state, error_code, updated_at) VALUES (?, ?, ?, 'error', ?, ?) ON CONFLICT(workspace_id, operation_item_id) DO UPDATE SET state = 'error', error_code = excluded.error_code, updated_at = excluded.updated_at`).bind(env.WORKSPACE_ID_SECRET, row.id, eventId ?? null, `google_${response.status}`, now).run()
      continue
    }
    const saved = z.object({ id: z.string() }).parse(await response.json())
    await env.DB.prepare(`INSERT INTO google_calendar_sync_items (workspace_id, operation_item_id, google_event_id, state, error_code, last_synced_at, updated_at) VALUES (?, ?, ?, 'synced', NULL, ?, ?) ON CONFLICT(workspace_id, operation_item_id) DO UPDATE SET google_event_id = excluded.google_event_id, state = 'synced', error_code = NULL, last_synced_at = excluded.last_synced_at, updated_at = excluded.updated_at`).bind(env.WORKSPACE_ID_SECRET, row.id, saved.id, now, now).run()
    synchronized += 1
  }
  await env.DB.prepare(`UPDATE google_calendar_connections SET last_sync_at = ?, error_code = NULL WHERE workspace_id = ?`).bind(isoNow(), env.WORKSPACE_ID_SECRET).run()
  await writeAudit(env, identity, 'calendar.synchronized', 'calendar_connection', env.WORKSPACE_ID_SECRET, { synchronized_count: synchronized })
  return { synchronized }
}

async function encryptSecret(secret: string, encodedKey: string) {
  const key = await crypto.subtle.importKey('raw', decodeBase64(encodedKey), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret))
  return `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(encrypted))}`
}
async function decryptSecret(value: string, encodedKey: string) {
  const [version, iv, encrypted] = value.split('.')
  if (version !== 'v1' || !iv || !encrypted) throw new Error('secret_format_invalid')
  const key = await crypto.subtle.importKey('raw', decodeBase64(encodedKey), 'AES-GCM', false, ['decrypt'])
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64(iv) }, key, decodeBase64(encrypted))
  return new TextDecoder().decode(clear)
}
function decodeBase64(value: string) { return Uint8Array.from(atob(value), (part) => part.charCodeAt(0)) }
function encodeBase64(value: Uint8Array) { return btoa(String.fromCharCode(...value)) }

async function createEncryptedBackup(env: Env) {
  if (env.BACKUPS_ENABLED !== 'true' || !env.BACKUPS) return { state: 'skipped' as const }
  const backupId = crypto.randomUUID()
  const tables = ['workspaces','documents','sources','operation_batches','operation_items','import_sources','health_daily_metrics','sleep_sessions','workout_sessions','google_calendar_connections','google_calendar_sync_items','data_quality_issues','regulatory_rules','benefit_opportunities','monitor_runs','backup_runs','audit_events'] as const
  const globalTables = new Set<(typeof tables)[number]>(['regulatory_rules', 'benefit_opportunities'])
  const data: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const table of tables) {
    const result = table === 'workspaces'
      ? await env.DB.prepare('SELECT * FROM workspaces WHERE id = ?').bind(env.WORKSPACE_ID_SECRET).all()
      : globalTables.has(table)
        ? await env.DB.prepare(`SELECT * FROM ${table}`).all()
        : await env.DB.prepare(`SELECT * FROM ${table} WHERE workspace_id = ?`).bind(env.WORKSPACE_ID_SECRET).all()
    data[table] = result.results
    counts[table] = result.results.length
  }
  const clear = new TextEncoder().encode(JSON.stringify({ schema: 'personal-os-d1-v1', created_at: isoNow(), workspace_id: env.WORKSPACE_ID_SECRET, data }))
  const key = await crypto.subtle.importKey('raw', decodeBase64(env.BACKUP_ENCRYPTION_KEY), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, clear))
  const envelope = packEncryptedBackup(iv, ciphertext)
  const objectKey = `${env.WORKSPACE_ID_SECRET}/database/${new Date().toISOString().slice(0, 10)}/${backupId}.json.enc`
  await env.BACKUPS.put(objectKey, envelope, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { schema: 'personal-os-d1-v1', envelope: 'PERSONALOSB1' } })
  await env.DB.prepare(`INSERT INTO backup_runs (id, workspace_id, object_key, state, row_counts_json, created_at, completed_at) VALUES (?, ?, ?, 'completed', ?, ?, ?)`).bind(backupId, env.WORKSPACE_ID_SECRET, objectKey, JSON.stringify(counts), isoNow(), isoNow()).run()
  return { state: 'completed' as const, backup_id: backupId }
}

async function scheduleMonthlyMonitors(env: Env) {
  const scheduledFor = `${new Date().toISOString().slice(0, 7)}-01`
  const month = Number(scheduledFor.slice(5, 7))
  const definitions = [
    ['benefits.monthly', 'Verificare novita nazionali, regionali e comunali su bonus e agevolazioni.'],
    ['regulations.monthly', 'Ricontrollare regole e scadenze legali usate per casa e mobilita.'],
    ['data.quality.monthly', 'Controllare dati mancanti, stime da sostituire e fonti scadute.'],
    ...([1, 4, 7, 10].includes(month) ? [['vehicle.valuation.quarterly', 'Aggiornare la quotazione documentata del veicolo e il costo totale di possesso.']] : []),
  ]
  const now = isoNow()
  const statements = definitions.map(([monitorKey, summary]) => env.DB.prepare(`INSERT OR IGNORE INTO monitor_runs
    (id, workspace_id, monitor_key, scheduled_for, state, summary, created_at) VALUES (?, ?, ?, ?, 'due', ?, ?)`)
    .bind(crypto.randomUUID(), env.WORKSPACE_ID_SECRET, monitorKey, scheduledFor, summary, now))
  statements.push(env.DB.prepare(`UPDATE regulatory_rules SET state = 'review_due' WHERE state = 'active' AND next_review_at <= ?`).bind(scheduledFor))
  await env.DB.batch(statements)
}

async function verifyEncryptedBackup(env: Env, backupId: string) {
  if (!env.BACKUPS || !env.BACKUP_ENCRYPTION_KEY) throw new Error('backup_secret_missing')
  const row = await env.DB.prepare(`SELECT object_key, row_counts_json, state FROM backup_runs WHERE id = ? AND workspace_id = ?`).bind(backupId, env.WORKSPACE_ID_SECRET).first<{ object_key: string | null; row_counts_json: string; state: string }>()
  if (!row?.object_key || row.state !== 'completed') throw new Error('backup_not_found')
  const object = await env.BACKUPS.get(row.object_key)
  if (!object) throw new Error('backup_object_missing')
  const stored = new Uint8Array(await object.arrayBuffer())
  const { iv, ciphertext } = unpackEncryptedBackup(stored)
  const key = await crypto.subtle.importKey('raw', decodeBase64(env.BACKUP_ENCRYPTION_KEY), 'AES-GCM', false, ['decrypt'])
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv).buffer },
    key,
    new Uint8Array(ciphertext).buffer,
  )
  const parsed = z.object({
    schema: z.literal('personal-os-d1-v1'),
    workspace_id: z.literal(env.WORKSPACE_ID_SECRET),
    data: z.record(z.string(), z.array(z.unknown())),
  }).parse(JSON.parse(new TextDecoder().decode(clear)))
  const expected = z.record(z.string(), z.number().int().nonnegative()).parse(JSON.parse(row.row_counts_json))
  for (const [table, count] of Object.entries(expected)) {
    if (!parsed.data[table] || parsed.data[table].length !== count) throw new Error('backup_count_mismatch')
  }
  return { verified: true as const, backup_id: backupId, table_count: Object.keys(expected).length, row_counts: expected }
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, context: ExecutionContext) {
    await ensureWorkspace(env)
    if (controller.cron === '17 */6 * * *' && env.GOOGLE_CALENDAR_ENABLED === 'true') context.waitUntil(syncGoogleCalendar(env, { actorId: 'system:calendar', actorType: 'system' }).catch(() => undefined))
    if (controller.cron === '42 3 * * *') context.waitUntil(createEncryptedBackup(env).catch(() => undefined))
    if (controller.cron === '11 7 1 * *') context.waitUntil(scheduleMonthlyMonitors(env).catch(() => undefined))
    context.waitUntil(env.DB.prepare('DELETE FROM api_rate_windows WHERE window_start < ?').bind(Math.floor(Date.now() / 60_000) - 2 * 24 * 60).run())
    const now = isoNow()
    context.waitUntil(Promise.all([
      env.DB.prepare('DELETE FROM document_excerpts WHERE expires_at <= ? OR revoked_at IS NOT NULL').bind(now).run(),
      env.DB.prepare('DELETE FROM upload_grants WHERE expires_at <= ? OR used_at IS NOT NULL OR revoked_at IS NOT NULL').bind(now).run(),
      env.DB.prepare('DELETE FROM google_calendar_oauth_states WHERE expires_at <= ? OR consumed_at IS NOT NULL').bind(now).run(),
    ]).then(() => undefined))
  },
}
