import type { ProposeOperations } from '../../../shared/contracts'
import { inferEvidenceStatus, operationSensitivity, requiresExplicitConfirmation } from '../../../shared/contracts'
import { buildCorePlus } from '../../../shared/core-plus'
import { decryptFieldPayload, encryptFieldPayload } from '../../../shared/field-encryption'
import { europeRomeDateTime } from '../../../shared/time'
import type { AccessIdentity, Env } from './bindings'

export function isoNow() { return new Date().toISOString() }

export async function ensureWorkspace(env: Env) {
  await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, owner_email, name, timezone, created_at) VALUES (?, ?, 'Spazio privato', 'Europe/Rome', ?)`)
    .bind(env.WORKSPACE_ID_SECRET, env.OWNER_EMAIL_SECRET.toLowerCase(), isoNow()).run()
  return { id: env.WORKSPACE_ID_SECRET, name: 'Spazio privato' }
}

export async function enforceRateLimit(env: Env, identity: AccessIdentity, routeGroup: string, maximum: number) {
  const windowStart = Math.floor(Date.now() / 60_000)
  await env.DB.prepare(`INSERT INTO api_rate_windows (actor_id, route_group, window_start, request_count)
    VALUES (?, ?, ?, 1) ON CONFLICT(actor_id, route_group, window_start)
    DO UPDATE SET request_count = request_count + 1`)
    .bind(identity.actorId, routeGroup, windowStart).run()
  const row = await env.DB.prepare('SELECT request_count FROM api_rate_windows WHERE actor_id = ? AND route_group = ? AND window_start = ?')
    .bind(identity.actorId, routeGroup, windowStart).first<{ request_count: number }>()
  return Number(row?.request_count ?? maximum + 1) <= maximum
}

export async function writeAudit(env: Env, identity: AccessIdentity | { actorId: string; actorType: 'import' | 'system' }, action: string, entityType: string, entityId?: string, metadata: Record<string, unknown> = {}) {
  await env.DB.prepare(`INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(env.WORKSPACE_ID_SECRET, identity.actorId, identity.actorType, action, entityType, entityId ?? null, JSON.stringify(metadata), isoNow()).run()
}

function riskReason(input: ProposeOperations) {
  if (input.operations.some((operation) => operation.supersedes_item_id)) return 'Correzione: confronto prima/dopo obbligatorio'
  if (input.source === 'document_extraction') return 'Dato estratto da documento: verificare fonte e valori'
  if (input.source === 'calculation') return 'Dato calcolato o stimato: non e una fonte primaria'
  if (input.operations.some((operation) => ['measurement','lab_result','medication','diagnosis','vaccination','appointment'].includes(operation.kind))) return 'Dato sanitario: conferma esplicita richiesta'
  if (input.operations.some((operation) => ['investment','account_balance','financial_snapshot','asset_valuation','liability_snapshot','mortgage_snapshot','pension_snapshot','insurance_policy','transaction','recurring_commitment','budget_target','utility_bill'].includes(operation.kind))) return 'Dato finanziario: conferma esplicita richiesta'
  return 'Controllo umano richiesto'
}

async function existingProposal(env: Env, idempotencyKey: string) {
  const batch = await env.DB.prepare(`SELECT id, state, requires_confirmation, risk_reason FROM operation_batches WHERE workspace_id = ? AND idempotency_key = ?`)
    .bind(env.WORKSPACE_ID_SECRET, idempotencyKey).first<Record<string, unknown>>()
  if (!batch) return null
  const items = await env.DB.prepare(`SELECT id, kind, title, effective_date, state FROM operation_items WHERE batch_id = ? ORDER BY created_at`).bind(batch.id).all()
  return { batch_id: batch.id, state: batch.state, requires_confirmation: Boolean(batch.requires_confirmation), risk_reason: batch.risk_reason, items: items.results, idempotent_replay: true }
}

export async function proposeOperations(env: Env, identity: AccessIdentity, input: ProposeOperations) {
  if (input.workspace_id !== env.WORKSPACE_ID_SECRET) throw new Error('workspace_mismatch')
  await ensureWorkspace(env)
  const replay = await existingProposal(env, input.idempotency_key)
  if (replay) return replay

  if (input.source_id) {
    const source = await env.DB.prepare('SELECT id FROM sources WHERE id = ? AND workspace_id = ?').bind(input.source_id, env.WORKSPACE_ID_SECRET).first()
    if (!source) throw new Error('source_not_found')
  }

  for (const operation of input.operations) {
    if (!operation.supersedes_item_id) continue
    const original = await env.DB.prepare('SELECT kind, state FROM operation_items WHERE id = ? AND workspace_id = ?')
      .bind(operation.supersedes_item_id, env.WORKSPACE_ID_SECRET).first<{ kind: string; state: string }>()
    if (!original || original.state !== 'confirmed' || original.kind !== operation.kind) throw new Error('invalid_superseded_record')
  }

  const createdAt = isoNow()
  const batchId = crypto.randomUUID()
  const needsConfirmation = requiresExplicitConfirmation(input) || identity.actorType === 'gpt'
  const items = input.operations.map((operation) => ({ id: crypto.randomUUID(), operation }))
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO operation_batches
      (id, workspace_id, requested_by, actor_type, source_kind, source_id, source_label, idempotency_key, state, requires_confirmation, risk_reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)`)
      .bind(batchId, env.WORKSPACE_ID_SECRET, identity.actorId, identity.actorType, input.source, input.source_id ?? null, input.source_label ?? null, input.idempotency_key, needsConfirmation ? 1 : 0, needsConfirmation ? riskReason(input) : null, createdAt),
  ]
  for (const { id, operation } of items) {
    const sensitivity = operationSensitivity(operation)
    const storedPayload = ['identity','highly_restricted'].includes(sensitivity)
      ? await encryptFieldPayload(operation.payload, env.FIELD_ENCRYPTION_SECRET, env.WORKSPACE_ID_SECRET)
      : JSON.stringify(operation.payload)
    statements.push(env.DB.prepare(`INSERT INTO operation_items
      (id, workspace_id, batch_id, kind, effective_date, state, title, payload_json, sensitivity, confidence, supersedes_item_id, source_document_id, evidence_status, created_at)
      VALUES (?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, env.WORKSPACE_ID_SECRET, batchId, operation.kind, operation.effective_date, operation.title, storedPayload, sensitivity, operation.confidence, operation.supersedes_item_id ?? null, operation.source_document_id ?? null, inferEvidenceStatus(input, operation), createdAt))
  }
  statements.push(env.DB.prepare(`INSERT INTO audit_events
    (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at)
    VALUES (?, ?, ?, 'proposal.created', 'operation_batch', ?, ?, ?)`)
    .bind(env.WORKSPACE_ID_SECRET, identity.actorId, identity.actorType, batchId, JSON.stringify({ source: input.source, item_count: items.length }), createdAt))
  await env.DB.batch(statements)
  return {
    batch_id: batchId,
    state: 'proposed' as const,
    requires_confirmation: needsConfirmation,
    risk_reason: needsConfirmation ? riskReason(input) : undefined,
    review_url: `${env.APP_ORIGIN}/?view=confirmations&batch=${batchId}`,
    items: items.map(({ id, operation }) => ({ id, kind: operation.kind, title: operation.title, effective_date: operation.effective_date, state: 'proposed' })),
  }
}

export async function decideOperationBatch(env: Env, identity: AccessIdentity, batchId: string, decision: 'confirm' | 'reject', note?: string) {
  const batch = await env.DB.prepare('SELECT id, source_id, state FROM operation_batches WHERE id = ? AND workspace_id = ?')
    .bind(batchId, env.WORKSPACE_ID_SECRET).first<{ id: string; source_id: string | null; state: string }>()
  if (!batch) throw new Error('batch_not_found')
  if (batch.state !== 'proposed') throw new Error('batch_already_decided')
  let authoritativeSource = false
  if (decision === 'confirm' && batch.source_id) {
    const source = await env.DB.prepare('SELECT state, reliability FROM sources WHERE id = ? AND workspace_id = ?').bind(batch.source_id, env.WORKSPACE_ID_SECRET).first<{ state: string; reliability: string }>()
    if (!source || source.state !== 'verified') throw new Error('source_not_verified')
    authoritativeSource = ['primary_authoritative','institution_issued'].includes(source.reliability)
  }
  const itemResult = await env.DB.prepare('SELECT id, kind, title, effective_date, payload_json, sensitivity, evidence_status, supersedes_item_id FROM operation_items WHERE batch_id = ? AND workspace_id = ? AND state = ?')
    .bind(batchId, env.WORKSPACE_ID_SECRET, 'proposed').all<{ id: string; kind: string; title: string; effective_date: string; payload_json: string; sensitivity: string; evidence_status: string; supersedes_item_id: string | null }>()
  const items = itemResult.results
  if (!items.length) throw new Error('batch_empty')

  const decidedAt = isoNow()
  const statements: D1PreparedStatement[] = []
  if (decision === 'confirm') {
    for (const item of items) {
      if (!item.supersedes_item_id) continue
      const original = await env.DB.prepare('SELECT kind, state FROM operation_items WHERE id = ? AND workspace_id = ?')
        .bind(item.supersedes_item_id, env.WORKSPACE_ID_SECRET).first<{ kind: string; state: string }>()
      if (!original || original.kind !== item.kind || original.state !== 'confirmed') throw new Error('superseded_record_changed')
      statements.push(env.DB.prepare(`UPDATE operation_items SET state = 'superseded' WHERE id = ? AND workspace_id = ? AND state = 'confirmed'`).bind(item.supersedes_item_id, env.WORKSPACE_ID_SECRET))
    }
    statements.push(env.DB.prepare(`UPDATE operation_items SET state = 'confirmed', confirmed_at = ?, evidence_status = CASE WHEN ? = 1 THEN 'verified' ELSE evidence_status END WHERE batch_id = ? AND workspace_id = ? AND state = 'proposed'`).bind(decidedAt, authoritativeSource ? 1 : 0, batchId, env.WORKSPACE_ID_SECRET))
    statements.push(env.DB.prepare(`UPDATE operation_batches SET state = 'confirmed', decided_at = ?, decided_by = ? WHERE id = ? AND workspace_id = ? AND state = 'proposed'`).bind(decidedAt, identity.actorId, batchId, env.WORKSPACE_ID_SECRET))
    for (const item of items) {
      const itemPayload = await ownerPayload(env, item.payload_json, item.sensitivity)
      const details = itemPayload.details && typeof itemPayload.details === 'object' && !Array.isArray(itemPayload.details)
        ? itemPayload.details as Record<string, unknown>
        : {}
      if (item.kind === 'event' && itemPayload.category === 'maintenance') {
        const explicitDueOn = typeof details.next_due_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(details.next_due_on) ? details.next_due_on : null
        const ruleKey = typeof details.rule_key === 'string' ? details.rule_key : null
        const rule = ruleKey ? await env.DB.prepare(`SELECT title, recurrence_json, source_url, last_verified_at FROM regulatory_rules WHERE rule_key = ? AND state IN ('active','review_due') ORDER BY version DESC LIMIT 1`).bind(ruleKey).first<{ title: string; recurrence_json: string; source_url: string; last_verified_at: string }>() : null
        const recurrence = rule ? payload({ payload_json: rule.recurrence_json }) : {}
        const intervalMonths = Number(recurrence.interval_months)
        const derivedDueOn = explicitDueOn ?? (Number.isFinite(intervalMonths) && intervalMonths > 0 ? shiftIsoMonths(item.effective_date, intervalMonths) : null)
        if (derivedDueOn) {
          const derivedBatchId = crypto.randomUUID()
          const derivedItemId = crypto.randomUUID()
          const reminders = Array.isArray(recurrence.remind_days_before) ? recurrence.remind_days_before : [30, 7, 1]
          const idempotencyKey = `derived:${item.id}:${derivedDueOn}`
          const deadlinePayload = {
            due_at: europeRomeDateTime(derivedDueOn),
            category: String(details.domain ?? (ruleKey?.startsWith('vehicle.') ? 'Auto' : 'Casa')),
            precision: explicitDueOn ? 'exact' : 'derived',
            remind_days_before: reminders,
            status: 'open',
            rule_key: ruleKey,
            source_url: rule?.source_url,
            source_checked_on: rule?.last_verified_at,
            derived_from_item_id: item.id,
          }
          statements.push(env.DB.prepare(`INSERT OR IGNORE INTO operation_batches
            (id, workspace_id, requested_by, actor_type, source_kind, source_label, idempotency_key, state, requires_confirmation, risk_reason, created_at, decided_at, decided_by)
            VALUES (?, ?, 'system:maintenance', 'system', 'calculation', ?, ?, 'confirmed', 0, NULL, ?, ?, 'system:maintenance')`)
            .bind(derivedBatchId, env.WORKSPACE_ID_SECRET, rule?.title ?? 'Scadenza manutenzione', idempotencyKey, decidedAt, decidedAt))
          statements.push(env.DB.prepare(`INSERT OR IGNORE INTO operation_items
            (id, workspace_id, batch_id, kind, effective_date, state, title, payload_json, sensitivity, confidence, evidence_status, created_at, confirmed_at)
            VALUES (?, ?, ?, 'deadline', ?, 'confirmed', ?, ?, 'personal', ?, 'planned', ?, ?)`)
            .bind(derivedItemId, env.WORKSPACE_ID_SECRET, derivedBatchId, derivedDueOn, `Controllo: ${item.title}`, JSON.stringify(deadlinePayload), rule ? 0.95 : 1, decidedAt, decidedAt))
          statements.push(env.DB.prepare(`INSERT INTO audit_events
            (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at)
            VALUES (?, 'system:maintenance', 'system', 'deadline.derived', 'operation_item', ?, ?, ?)`)
            .bind(env.WORKSPACE_ID_SECRET, derivedItemId, JSON.stringify({ source_item_id: item.id, rule_key: ruleKey, due_on: derivedDueOn }), decidedAt))
        } else {
          statements.push(env.DB.prepare(`INSERT INTO data_quality_issues
            (id, workspace_id, operation_item_id, severity, code, message, state, domain, created_at)
            VALUES (?, ?, ?, 'warning', 'maintenance_due_date_required', ?, 'open', 'home', ?)`)
            .bind(crypto.randomUUID(), env.WORKSPACE_ID_SECRET, item.id, `Definire il prossimo controllo per ${item.title}: la fonte selezionata non consente una scadenza automatica universale.`, decidedAt))
        }
      }
      const exactExpiry = item.kind === 'utility_bill' ? isoDateOrNull(itemPayload.due_on)
        : item.kind === 'insurance_policy' ? isoDateOrNull(itemPayload.expires_on)
          : item.kind === 'recurring_commitment' ? isoDateOrNull(itemPayload.ends_on)
            : item.kind === 'fact' && itemPayload.category === 'warranty' ? isoDateOrNull(details.expires_on) : null
      if (exactExpiry) {
        const category = item.kind === 'utility_bill' ? 'Bollette' : item.kind === 'insurance_policy' ? 'Assicurazioni' : itemPayload.category === 'warranty' ? 'Garanzie' : 'Contratti'
        const prefix = item.kind === 'utility_bill' ? 'Pagamento' : item.kind === 'insurance_policy' ? 'Rinnovo' : 'Scadenza'
        statements.push(...derivedDeadlineStatements(env, item.id, exactExpiry, `${prefix}: ${item.title}`, category,
          item.kind === 'insurance_policy' ? [45, 30, 7, 1] : [30, 7, 1], decidedAt))
      }
      if (item.kind === 'fact' && itemPayload.category === 'benefit.monitor_review') {
        statements.push(env.DB.prepare(`UPDATE monitor_runs SET state = 'completed', completed_at = ?, summary = ?, source_count = ?
          WHERE id = (SELECT id FROM monitor_runs WHERE workspace_id = ? AND monitor_key = 'benefits.monthly' AND state = 'due' ORDER BY scheduled_for DESC LIMIT 1)`)
          .bind(decidedAt, item.title, Number(details.source_count ?? 0), env.WORKSPACE_ID_SECRET))
      }
      if (item.kind === 'fact' && itemPayload.category === 'benefit.opportunity') {
        const benefitKey = boundedKey(details.benefit_key)
        const sourceUrl = officialUrl(details.source_url)
        if (!benefitKey || !sourceUrl) throw new Error('benefit_source_required')
        const previous = await env.DB.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM benefit_opportunities WHERE benefit_key = ? AND jurisdiction = ?`)
          .bind(benefitKey, boundedText(details.jurisdiction, 'IT', 20)).first<{ version: number }>()
        const benefitCategory = ['utilities','home','mobility','person','appliances','tax'].includes(String(details.category)) ? String(details.category) : 'person'
        const eligibility = pickDetails(details, ['isee_max','large_family_isee_max','large_family_min_children','requires_dsu','requires_household_contract_holder','requires_eligible_work','requires_traceable_payment','implementation_check_required','rate','person_cap','condominium_cap'])
        statements.push(env.DB.prepare(`UPDATE benefit_opportunities SET state = 'superseded' WHERE benefit_key = ? AND jurisdiction = ? AND state != 'superseded'`)
          .bind(benefitKey, boundedText(details.jurisdiction, 'IT', 20)))
        statements.push(env.DB.prepare(`INSERT INTO benefit_opportunities
          (id, benefit_key, version, title, category, jurisdiction, summary, eligibility_json, source_publisher, source_url, valid_from, valid_to, application_deadline, last_verified_at, next_review_at, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), benefitKey, Number(previous?.version ?? 0) + 1, item.title, benefitCategory,
            boundedText(details.jurisdiction, 'IT', 20), boundedText(itemPayload.value, item.title, 2000), JSON.stringify(eligibility),
            boundedText(details.source_publisher, 'Fonte ufficiale', 160), sourceUrl, isoDateOrNull(details.valid_from),
            isoDateOrNull(details.valid_to), isoDateOrNull(details.application_deadline), item.effective_date,
            isoDateOrNull(details.next_review_at) ?? shiftIsoMonths(item.effective_date, 1), details.state === 'monitoring' ? 'monitoring' : 'open'))
      }
      if (item.kind === 'fact' && itemPayload.category === 'regulatory.rule_update') {
        const ruleKey = boundedKey(details.rule_key)
        const sourceUrl = officialUrl(details.source_url)
        if (!ruleKey || !sourceUrl) throw new Error('regulatory_source_required')
        const previous = await env.DB.prepare(`SELECT version, domain, jurisdiction, title, rule_type, recurrence_json, applicability_json, source_publisher, effective_from, effective_to, notes
          FROM regulatory_rules WHERE rule_key = ? ORDER BY version DESC LIMIT 1`).bind(ruleKey).first<Record<string, unknown>>()
        const domain = ['home','mobility','benefits','isee','documents'].includes(String(details.domain)) ? String(details.domain) : String(previous?.domain ?? 'documents')
        const ruleType = ['legal','manufacturer','recommended','monitor'].includes(String(details.rule_type)) ? String(details.rule_type) : String(previous?.rule_type ?? 'recommended')
        const recurrence = { ...jsonObject(previous?.recurrence_json), ...pickDetails(details, ['interval_months','first_interval_months','grace_days','remind_days_before','requires_exact_due_date','requires_manual_interval','requires_condition_check','season_start','season_end','change_window_days']) }
        const applicability = { ...jsonObject(previous?.applicability_json), ...pickDetails(details, ['region_required','manual_required','local_ordinance_required','mass_max_kg','fuel_type','power_kw']) }
        const jurisdiction = boundedText(details.jurisdiction, String(previous?.jurisdiction ?? 'IT'), 20)
        statements.push(env.DB.prepare(`UPDATE regulatory_rules SET state = 'superseded' WHERE rule_key = ? AND jurisdiction = ? AND state != 'superseded'`).bind(ruleKey, jurisdiction))
        statements.push(env.DB.prepare(`INSERT INTO regulatory_rules
          (id, rule_key, version, domain, jurisdiction, title, rule_type, recurrence_json, applicability_json, source_publisher, source_url, effective_from, effective_to, last_verified_at, next_review_at, state, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
          .bind(crypto.randomUUID(), ruleKey, Number(previous?.version ?? 0) + 1, domain, jurisdiction,
            boundedText(details.title, String(previous?.title ?? item.title), 200), ruleType, JSON.stringify(recurrence), JSON.stringify(applicability),
            boundedText(details.source_publisher, String(previous?.source_publisher ?? 'Fonte ufficiale'), 160), sourceUrl,
            isoDateOrNull(details.effective_from) ?? isoDateOrNull(previous?.effective_from), isoDateOrNull(details.effective_to),
            item.effective_date, isoDateOrNull(details.next_review_at) ?? shiftIsoMonths(item.effective_date, 1),
            boundedText(details.notes, String(previous?.notes ?? ''), 2000) || null))
      }
      if (item.kind === 'fact' && itemPayload.category === 'regulatory.monitor_review') {
        statements.push(env.DB.prepare(`UPDATE monitor_runs SET state = 'completed', completed_at = ?, summary = ?, source_count = ?
          WHERE id = (SELECT id FROM monitor_runs WHERE workspace_id = ? AND monitor_key = 'regulations.monthly' AND state = 'due' ORDER BY scheduled_for DESC LIMIT 1)`)
          .bind(decidedAt, item.title, Number(details.source_count ?? 0), env.WORKSPACE_ID_SECRET))
      }
    }
  } else {
    statements.push(env.DB.prepare(`UPDATE operation_items SET state = 'rejected' WHERE batch_id = ? AND workspace_id = ? AND state = 'proposed'`).bind(batchId, env.WORKSPACE_ID_SECRET))
    statements.push(env.DB.prepare(`UPDATE operation_batches SET state = 'rejected', decided_at = ?, decided_by = ? WHERE id = ? AND workspace_id = ? AND state = 'proposed'`).bind(decidedAt, identity.actorId, batchId, env.WORKSPACE_ID_SECRET))
  }
  statements.push(env.DB.prepare(`INSERT INTO audit_events
    (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at)
    VALUES (?, ?, ?, ?, 'operation_batch', ?, ?, ?)`)
    .bind(env.WORKSPACE_ID_SECRET, identity.actorId, identity.actorType, decision === 'confirm' ? 'proposal.confirmed' : 'proposal.rejected', batchId, JSON.stringify(note ? { note } : {}), decidedAt))
  await env.DB.batch(statements)
  return { batch_id: batchId, state: decision === 'confirm' ? 'confirmed' : 'rejected', item_count: items.length }
}

function payload(row: { payload_json: string }) {
  try { return JSON.parse(row.payload_json) as Record<string, unknown> } catch { return {} }
}

async function ownerPayload(env: Env, value: string, sensitivity: string) {
  if (!['identity','highly_restricted'].includes(sensitivity)) return payload({ payload_json: value })
  return decryptFieldPayload(value, env.FIELD_ENCRYPTION_SECRET, env.WORKSPACE_ID_SECRET)
}

function boundedText(value: unknown, fallback: string, maximum: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text || fallback).slice(0, maximum)
}

function boundedKey(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[a-z0-9]+([._-][a-z0-9]+)*$/.test(text) ? text.slice(0, 160) : null
}

function officialUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString().slice(0, 1000) : null } catch { return null }
}

function isoDateOrNull(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function jsonObject(value: unknown) {
  if (typeof value !== 'string') return {}
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} }
}

function pickDetails(details: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => details[key] !== undefined).map((key) => [key, details[key]]))
}

function derivedDeadlineStatements(env: Env, sourceItemId: string, dueOn: string, title: string, category: string, reminders: number[], createdAt: string) {
  const batchId = crypto.randomUUID()
  const itemId = crypto.randomUUID()
  return [
    env.DB.prepare(`INSERT INTO operation_batches
      (id, workspace_id, requested_by, actor_type, source_kind, source_label, idempotency_key, state, requires_confirmation, risk_reason, created_at, decided_at, decided_by)
      VALUES (?, ?, 'system:expiry', 'system', 'calculation', ?, ?, 'confirmed', 0, NULL, ?, ?, 'system:expiry')`)
      .bind(batchId, env.WORKSPACE_ID_SECRET, title, `derived-expiry:${sourceItemId}:${dueOn}`, createdAt, createdAt),
    env.DB.prepare(`INSERT INTO operation_items
      (id, workspace_id, batch_id, kind, effective_date, state, title, payload_json, sensitivity, confidence, evidence_status, created_at, confirmed_at)
      VALUES (?, ?, ?, 'deadline', ?, 'confirmed', ?, ?, 'personal', 1, 'planned', ?, ?)`)
      .bind(itemId, env.WORKSPACE_ID_SECRET, batchId, dueOn, title, JSON.stringify({ due_at: europeRomeDateTime(dueOn), category, precision: 'exact', remind_days_before: reminders, status: 'open', derived_from_item_id: sourceItemId }), createdAt, createdAt),
    env.DB.prepare(`INSERT INTO audit_events
      (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at)
      VALUES (?, 'system:expiry', 'system', 'deadline.derived', 'operation_item', ?, ?, ?)`)
      .bind(env.WORKSPACE_ID_SECRET, itemId, JSON.stringify({ source_item_id: sourceItemId, due_on: dueOn }), createdAt),
  ]
}

export async function getDashboard(env: Env) {
  const workspace = await ensureWorkspace(env)
  const [batches, proposedItems, current, currentCount, documents, audit, calendar, sources, issues, imports, latestBackup, dailyHealth, healthCatalog, sleep, workouts, rules, benefits, monitors] = await Promise.all([
    env.DB.prepare(`SELECT id, source_label, risk_reason, created_at, state FROM operation_batches WHERE workspace_id = ? AND state = 'proposed' ORDER BY created_at DESC LIMIT 100`).bind(env.WORKSPACE_ID_SECRET).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT proposed.id, proposed.batch_id, proposed.kind, proposed.title, proposed.effective_date,
      proposed.state, proposed.payload_json, proposed.sensitivity, proposed.supersedes_item_id,
      original.title AS previous_title, original.effective_date AS previous_effective_date,
      original.payload_json AS previous_payload_json, original.sensitivity AS previous_sensitivity
      FROM operation_items proposed
      LEFT JOIN operation_items original
        ON original.id = proposed.supersedes_item_id
        AND original.workspace_id = proposed.workspace_id
      WHERE proposed.workspace_id = ? AND proposed.state = 'proposed'
      ORDER BY proposed.created_at`).bind(env.WORKSPACE_ID_SECRET).all<Record<string, unknown> & { payload_json: string; sensitivity: string; previous_payload_json?: string | null; previous_sensitivity?: string | null; batch_id: string }>(),
    env.DB.prepare(`SELECT id, kind, title, effective_date, state, payload_json, sensitivity, confidence, supersedes_item_id, evidence_status FROM operation_items WHERE workspace_id = ? AND state = 'confirmed' ORDER BY effective_date DESC, created_at DESC LIMIT 10000`).bind(env.WORKSPACE_ID_SECRET).all<Record<string, unknown> & { payload_json: string; sensitivity: string; kind: string; title: string; effective_date: string; id: string; state: string }>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM operation_items WHERE workspace_id = ? AND state = 'confirmed'`).bind(env.WORKSPACE_ID_SECRET).first<{ count: number }>(),
    env.DB.prepare(`SELECT id, title, document_type, document_date, sensitivity, state, created_at FROM documents WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 250`).bind(env.WORKSPACE_ID_SECRET).all(),
    env.DB.prepare(`SELECT id, action, entity_type, occurred_at FROM audit_events WHERE workspace_id = ? ORDER BY id DESC LIMIT 100`).bind(env.WORKSPACE_ID_SECRET).all(),
    env.DB.prepare(`SELECT state, last_sync_at, error_code FROM google_calendar_connections WHERE workspace_id = ?`).bind(env.WORKSPACE_ID_SECRET).first(),
    env.DB.prepare(`SELECT id, source_type, provider, label, coverage_start, coverage_end, source_date, reliability, state, expected_refresh_days, last_reviewed_at, created_at FROM sources WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 250`).bind(env.WORKSPACE_ID_SECRET).all(),
    env.DB.prepare(`SELECT id, severity, code, message, state, created_at FROM data_quality_issues WHERE workspace_id = ? AND state = 'open' ORDER BY created_at DESC LIMIT 100`).bind(env.WORKSPACE_ID_SECRET).all(),
    env.DB.prepare(`SELECT id, source_name, source_type, state, expected_counts_json, actual_counts_json, imported_at FROM import_sources WHERE workspace_id = ? ORDER BY imported_at DESC LIMIT 50`).bind(env.WORKSPACE_ID_SECRET).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, state, row_counts_json, completed_at, error_code FROM backup_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1`).bind(env.WORKSPACE_ID_SECRET).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT metric.id, metric.observed_on, metric.metric_key, metric.source_label, metric.unit, metric.record_count, metric.value_sum, metric.value_avg, metric.value_min, metric.value_max, metric.value_first, metric.value_last FROM health_daily_metrics metric JOIN import_sources imported ON imported.id = metric.import_source_id AND imported.workspace_id = metric.workspace_id WHERE metric.workspace_id = ? AND imported.state = 'verified' ORDER BY metric.observed_on DESC LIMIT 2500`).bind(env.WORKSPACE_ID_SECRET).all(),
    env.DB.prepare(`SELECT metric.metric_key, metric.unit, MIN(metric.observed_on) AS coverage_start, MAX(metric.observed_on) AS coverage_end, COUNT(*) AS day_count, COUNT(DISTINCT metric.source_label) AS source_count
      FROM health_daily_metrics metric
      JOIN import_sources imported ON imported.id = metric.import_source_id AND imported.workspace_id = metric.workspace_id
      WHERE metric.workspace_id = ? AND imported.state = 'verified'
      GROUP BY metric.metric_key, metric.unit ORDER BY metric.metric_key`).bind(env.WORKSPACE_ID_SECRET).all(),
    env.DB.prepare(`SELECT session.id, session.observed_on, session.detected_hours, session.valid_hours, session.efficiency, session.core_minutes, session.deep_minutes, session.rem_minutes, session.awake_minutes, session.source_status FROM sleep_sessions session JOIN import_sources imported ON imported.id = session.import_source_id AND imported.workspace_id = session.workspace_id WHERE session.workspace_id = ? AND imported.state = 'verified' ORDER BY session.observed_on DESC LIMIT 730`).bind(env.WORKSPACE_ID_SECRET).all(),
    env.DB.prepare(`SELECT workout.id, workout.observed_on, workout.activity_type, workout.duration_minutes, workout.distance_km, workout.energy_kcal, workout.average_heart_rate, workout.maximum_heart_rate, workout.running_speed_kmh, workout.source_label FROM workout_sessions workout JOIN import_sources imported ON imported.id = workout.import_source_id AND imported.workspace_id = workout.workspace_id WHERE workout.workspace_id = ? AND imported.state = 'verified' ORDER BY workout.observed_on DESC LIMIT 1000`).bind(env.WORKSPACE_ID_SECRET).all(),
    env.DB.prepare(`SELECT id, rule_key, version, domain, jurisdiction, title, rule_type, recurrence_json, applicability_json, source_publisher, source_url, effective_from, effective_to, last_verified_at, next_review_at, state, notes FROM regulatory_rules WHERE state IN ('active','review_due') ORDER BY domain, title`).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, benefit_key, version, title, category, jurisdiction, summary, eligibility_json, source_publisher, source_url, valid_from, valid_to, application_deadline, last_verified_at, next_review_at, state FROM benefit_opportunities WHERE state IN ('open','monitoring') ORDER BY category, title`).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, monitor_key, scheduled_for, state, summary, source_count, created_at, completed_at FROM monitor_runs WHERE workspace_id = ? ORDER BY scheduled_for DESC, monitor_key LIMIT 50`).bind(env.WORKSPACE_ID_SECRET).all(),
  ])
  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const item of proposedItems.results) {
    const { payload_json, sensitivity, previous_payload_json, previous_sensitivity, previous_title, previous_effective_date, ...visible } = item
    const parsed = {
      ...visible,
      sensitivity,
      payload: await ownerPayload(env, payload_json, sensitivity),
      previous: previous_payload_json ? {
        id: item.supersedes_item_id,
        title: previous_title,
        effective_date: previous_effective_date,
        payload: await ownerPayload(env, previous_payload_json, String(previous_sensitivity ?? 'personal')),
      } : null,
    }
    const list = grouped.get(item.batch_id) ?? []
    list.push(parsed)
    grouped.set(item.batch_id, list)
  }
  const records = await Promise.all([...current.results].reverse().map(async (row) => {
    const { payload_json, ...visible } = row
    return { ...visible, payload: await ownerPayload(env, payload_json, row.sensitivity) }
  }))
  const deadlines = records.filter((row) => row.kind === 'deadline').map((row) => ({ id: row.id, title: row.title, due_at: String(row.payload.due_at), category: String(row.payload.category), precision: String(row.payload.precision), remind_days_before: Array.isArray(row.payload.remind_days_before) ? row.payload.remind_days_before : [30, 7, 1], status: String(row.payload.status ?? 'open') })).sort((a, b) => a.due_at.localeCompare(b.due_at))
  const snapshots = records.filter((row) => ['financial_snapshot','mortgage_snapshot'].includes(row.kind)).map((row) => ({ id: row.id, observed_on: row.effective_date, metric_key: String(row.payload.metric_key), amount: Number(row.payload.amount), precision: String(row.payload.precision) }))
  const investments = records.filter((row) => row.kind === 'investment').map((row) => ({ id: row.id, occurred_on: row.effective_date, instrument_code: String(row.payload.instrument_code), amount: row.payload.amount == null ? null : Number(row.payload.amount), state: row.state })).reverse()
  const measurements = records.filter((row) => row.kind === 'measurement').map((row) => ({ id: row.id, measured_at: String(row.payload.measured_at), metric_key: String(row.payload.metric_key), value_numeric: Number(row.payload.value), unit: String(row.payload.unit), state: row.state }))
  const importRows = imports.results.map((rawRow) => {
    const row = rawRow as Record<string, unknown>
    return {
      ...row,
      state: String(row.state),
      expected_counts: JSON.parse(String(row.expected_counts_json)) as Record<string, number>,
      actual_counts: JSON.parse(String(row.actual_counts_json)) as Record<string, number>,
    }
  })
  const healthImportedRecordCount = importRows.filter((row) => row.state === 'verified').reduce((sum, row) => sum + Object.values(row.actual_counts).reduce((part, value) => part + Number(value || 0), 0), 0)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const corePlus = buildCorePlus({
    records: records as any,
    pending: batches.results as any,
    sources: sources.results as any,
    issues: issues.results as any,
    documents: documents.results as any,
    health_imported_record_count: healthImportedRecordCount,
    sleep: sleep.results as any,
    workouts: workouts.results as any,
    today,
  })
  const parsedRules = rules.results.map((row) => ({ ...row, recurrence: JSON.parse(String(row.recurrence_json)), applicability: JSON.parse(String(row.applicability_json)) }))
  const parsedBenefits = benefits.results.map((row) => ({ ...row, eligibility: JSON.parse(String(row.eligibility_json)) }))
  const dueMonitors = monitors.results.filter((row) => row.state === 'due')
  if (dueMonitors.length) {
    corePlus.brief.priorities = [...dueMonitors.slice(0, 3).map((row) => ({
      kind: 'monitor', title: monitorTitle(String(row.monitor_key)), detail: String(row.summary ?? 'Revisione periodica da completare'), target_view: String(row.monitor_key).startsWith('benefits') ? 'home' : 'sources', severity: 'warning',
    })), ...corePlus.brief.priorities].slice(0, 3)
  }
  return {
    workspace,
    pending: batches.results.map((batch) => ({ ...batch, operation_items: grouped.get(String(batch.id)) ?? [] })),
    deadlines,
    snapshots,
    investments,
    measurements,
    records,
    record_coverage: {
      returned: records.length,
      total: Number(currentCount?.count ?? records.length),
      truncated: Number(currentCount?.count ?? records.length) > records.length,
      coverage_start: records.at(0)?.effective_date ?? null,
      coverage_end: records.at(-1)?.effective_date ?? null,
    },
    health_daily_metrics: dailyHealth.results,
    health_metric_catalog: healthCatalog.results,
    sleep: sleep.results,
    workouts: workouts.results,
    documents: documents.results,
    audit: audit.results,
    calendar,
    sources: sources.results,
    quality_issues: issues.results,
    imports: importRows,
    regulatory_rules: parsedRules,
    benefits: parsedBenefits,
    monitors: monitors.results,
    ...corePlus,
    system: {
      database: true,
      access: env.ACCESS_ENFORCED === 'true',
      gpt: Boolean(env.GPT_SERVICE_TOKEN_ID_SECRET),
      documents: env.DOCUMENTS_ENABLED === 'true' && Boolean(env.DOCUMENTS),
      backups: env.BACKUPS_ENABLED === 'true' && Boolean(env.BACKUPS),
      calendar: env.GOOGLE_CALENDAR_ENABLED === 'true',
      latest_backup: latestBackup ? { ...latestBackup, row_counts: JSON.parse(String(latestBackup.row_counts_json)) } : null,
    },
  }
}

export async function getHealthSeries(env: Env, metricKey: string, from: string | undefined, to: string | undefined, limit: number) {
  const where = [`metric.workspace_id = ?`, `imported.state = 'verified'`, `metric.metric_key = ?`]
  const bindings: unknown[] = [env.WORKSPACE_ID_SECRET, metricKey]
  if (from) { where.push(`metric.observed_on >= ?`); bindings.push(from) }
  if (to) { where.push(`metric.observed_on <= ?`); bindings.push(to) }
  bindings.push(limit)
  const rows = await env.DB.prepare(`SELECT metric.id, metric.observed_on, metric.metric_key, metric.source_label, metric.unit, metric.record_count, metric.value_sum, metric.value_avg, metric.value_min, metric.value_max, metric.value_first, metric.value_last
    FROM health_daily_metrics metric
    JOIN import_sources imported ON imported.id = metric.import_source_id AND imported.workspace_id = metric.workspace_id
    WHERE ${where.join(' AND ')} ORDER BY metric.observed_on ASC LIMIT ?`).bind(...bindings).all()
  const total = await env.DB.prepare(`SELECT COUNT(*) AS count FROM health_daily_metrics metric
    JOIN import_sources imported ON imported.id = metric.import_source_id AND imported.workspace_id = metric.workspace_id
    WHERE ${where.join(' AND ')}`).bind(...bindings.slice(0, -1)).first<{ count: number }>()
  return {
    metric_key: metricKey,
    rows: rows.results,
    coverage: { returned: rows.results.length, total: Number(total?.count ?? rows.results.length), truncated: Number(total?.count ?? rows.results.length) > rows.results.length },
  }
}

function shiftIsoMonths(date: string, months: number) {
  const value = new Date(`${date}T12:00:00Z`)
  const originalDay = value.getUTCDate()
  value.setUTCDate(1)
  value.setUTCMonth(value.getUTCMonth() + Math.round(months))
  const endOfMonth = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate()
  value.setUTCDate(Math.min(originalDay, endOfMonth))
  return value.toISOString().slice(0, 10)
}

function monitorTitle(value: string) {
  return ({
    'benefits.monthly': 'Verifica mensile bonus',
    'regulations.monthly': 'Verifica normativa mensile',
    'vehicle.valuation.quarterly': 'Aggiorna valore residuo auto',
    'data.quality.monthly': 'Controllo mensile completezza dati',
  } as Record<string, string>)[value] ?? value
}

export function minimizeRecord(row: Record<string, unknown> & { payload_json?: string }) {
  const result: Record<string, unknown> = { id: row.id, kind: row.kind, effective_date: row.effective_date, state: row.state, title: row.title, confidence: row.confidence, evidence_status: row.evidence_status, supersedes_item_id: row.supersedes_item_id }
  if (!['identity','highly_restricted'].includes(String(row.sensitivity)) && row.payload_json) result.payload = payload({ payload_json: row.payload_json })
  return result
}
