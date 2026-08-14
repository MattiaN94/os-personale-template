import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = parseArgs(process.argv.slice(2))
const packagePath = resolve(required(args, 'package'))
const workspaceId = required(args, 'workspace')
const actor = required(args, 'actor').toLowerCase()
const database = args.database ?? 'personal-os'
const config = resolve(args.config ?? 'workers/api/wrangler.jsonc')
const promoteVerified = args['promote-verified'] === true

assertUuid(workspaceId, 'workspace')
if (!actor.includes('@') || actor.length > 254) fail('actor must be an email address')
if (!isAbsolute(packagePath) || !isAbsolute(config)) fail('package and config paths must resolve absolutely')

const source = validatePackage(JSON.parse(readFileSync(packagePath, 'utf8')))
const importDigest = source.artifact_sha256 ?? source.source_sha256
const expected = {
  daily_metrics: source.daily_metrics.length,
  sleep: source.sleep.length,
  workouts: source.workouts.length,
}
const now = new Date().toISOString()
const existing = queryOne(`SELECT id, source_id, state FROM import_sources WHERE workspace_id = ${sql(workspaceId)} AND source_sha256 = ${sql(importDigest)} LIMIT 1`)
const importId = existing?.id ? String(existing.id) : randomUUID()
const sourceId = existing?.source_id ? String(existing.source_id) : randomUUID()
let state = existing?.state ? String(existing.state) : 'new'

if (!existing) {
  const notes = JSON.stringify({
    state: 'staged_pending_review',
    artifact_name: source.artifact_name ?? null,
    artifact_sha256: source.artifact_sha256 ?? null,
    upstream_record_count: source.upstream_record_count ?? null,
    transformation: source.transformation ?? null,
    validation: source.validation ?? 'pending',
    import_mode: source.import_mode ?? 'snapshot',
    upstream_source_sha256: source.source_sha256,
  })
  const sourceType = source.source_type === 'apple_health_export' ? 'apple_health_export' : 'import_package'
  const provider = source.source_type === 'apple_health_export' ? 'Apple' : null
  const reliability = source.source_type === 'apple_health_export' && source.validation === 'reconciled' ? 'primary_authoritative' : 'user_confirmed'
  const refreshDays = source.source_type === 'apple_health_export' ? 45 : 180
  executeCommand(`
    INSERT INTO sources (id, workspace_id, source_type, provider, label, source_sha256, coverage_start, coverage_end, source_date, reliability, state, expected_refresh_days, created_by, created_at, notes)
    VALUES (${values([sourceId, workspaceId, sourceType, provider, source.source_name, importDigest, source.coverage_start ?? null, source.coverage_end ?? null, source.exported_at?.slice(0, 10) ?? null, reliability, 'pending_review', refreshDays, actor, now, notes])});
    INSERT INTO import_sources (id, workspace_id, source_id, source_type, source_name, source_sha256, schema_version, state, expected_counts_json, actual_counts_json, imported_by, imported_at)
    VALUES (${values([importId, workspaceId, sourceId, source.source_type ?? 'health_workbook', source.source_name, importDigest, source.schema_version, 'staged', JSON.stringify(expected), '{}', actor, now])});
    INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at)
    VALUES (${values([workspaceId, actor, 'owner', 'import.staged', 'import_source', importId, JSON.stringify({ source_id: sourceId, channel: 'wrangler_admin' }), now])});
  `)
  state = 'staged'
}

if (state === 'rejected' || state === 'failed' || state === 'superseded') fail(`existing import cannot be resumed from state ${state}`)

if (state === 'staged') {
  const statements = [
    ...dailyStatements(source.daily_metrics),
    ...sleepStatements(source.sleep),
    ...workoutStatements(source.workouts),
  ]
  executeStatementFiles(statements)
}

const actual = importCounts(importId)
const countsMatch = Object.entries(expected).every(([key, count]) => actual[key] === count)
if (state === 'staged') {
  const completedAt = new Date().toISOString()
  const mismatchStatement = countsMatch ? '' : `
    INSERT INTO data_quality_issues (id, workspace_id, source_id, severity, code, message, state, created_at, domain)
    VALUES (${values([randomUUID(), workspaceId, sourceId, 'blocking', 'import_count_mismatch', `Conteggi import non coerenti. Attesi ${JSON.stringify(expected)}, ricevuti ${JSON.stringify(actual)}`, 'open', completedAt, 'health'])});`
  executeCommand(`
    UPDATE import_sources SET state = 'pending_review', actual_counts_json = ${sql(JSON.stringify(actual))}
    WHERE id = ${sql(importId)} AND workspace_id = ${sql(workspaceId)} AND state = 'staged';
    INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at)
    VALUES (${values([workspaceId, actor, 'owner', 'import.pending_review', 'import_source', importId, JSON.stringify({ expected, actual, counts_match: countsMatch, channel: 'wrangler_admin' }), completedAt])});
    ${mismatchStatement}
  `)
  state = 'pending_review'
}

if (!countsMatch) fail(`import count mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)

if (promoteVerified && state === 'pending_review') {
  if (source.validation !== 'reconciled') fail('only a reconciled package can be promoted automatically')
  const blocking = queryOne(`SELECT count(*) AS count FROM data_quality_issues WHERE workspace_id = ${sql(workspaceId)} AND source_id = ${sql(sourceId)} AND severity = 'blocking' AND state = 'open'`)
  if (Number(blocking?.count ?? 0) > 0) fail('source has blocking data-quality issues')
  const verifiedAt = new Date().toISOString()
  executeCommand(`
    UPDATE sources SET state = 'verified', verified_at = ${sql(verifiedAt)}, last_reviewed_at = ${sql(verifiedAt)}
    WHERE id = ${sql(sourceId)} AND workspace_id = ${sql(workspaceId)} AND state = 'pending_review';
    UPDATE import_sources SET state = 'verified', verified_at = ${sql(verifiedAt)}
    WHERE id = ${sql(importId)} AND workspace_id = ${sql(workspaceId)} AND state = 'pending_review';
    INSERT INTO audit_events (workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json, occurred_at)
    VALUES (${values([workspaceId, actor, 'owner', 'source.verified', 'source', sourceId, JSON.stringify({ import_id: importId, counts: actual, validation: source.validation, channel: 'wrangler_admin' }), verifiedAt])});
  `)
  state = 'verified'
}

const finalRow = queryOne(`SELECT imported.state, sources.state AS source_state FROM import_sources imported JOIN sources ON sources.id = imported.source_id WHERE imported.id = ${sql(importId)} AND imported.workspace_id = ${sql(workspaceId)}`)
process.stdout.write(`${JSON.stringify({
  import_id: importId,
  source_id: sourceId,
  import_state: finalRow?.state ?? state,
  source_state: finalRow?.source_state ?? null,
  expected_counts: expected,
  actual_counts: actual,
  counts_match: countsMatch,
  excluded_manual_or_estimated_weights: source.excluded_counts?.manual_or_estimated_weights ?? 0,
}, null, 2)}\n`)

function dailyStatements(rows) {
  return chunk(rows, 100).map((batch) => `INSERT OR IGNORE INTO health_daily_metrics (id, workspace_id, import_source_id, observed_on, metric_key, source_label, unit, record_count, value_sum, value_avg, value_min, value_max, value_first, value_last, created_at) VALUES\n${batch.map((raw) => {
    const row = validateDaily(raw)
    return `(${values([randomUUID(), workspaceId, importId, row.observed_on, row.metric_key, row.source_label, row.unit, row.record_count ?? null, row.value_sum ?? null, row.value_avg ?? null, row.value_min ?? null, row.value_max ?? null, row.value_first ?? null, row.value_last ?? null, now])})`
  }).join(',\n')};`)
}

function sleepStatements(rows) {
  return chunk(rows, 100).map((batch) => `INSERT OR IGNORE INTO sleep_sessions (id, workspace_id, import_source_id, observed_on, detected_hours, valid_hours, efficiency, core_minutes, deep_minutes, rem_minutes, awake_minutes, source_status, created_at) VALUES\n${batch.map((raw) => {
    const row = validateSleep(raw)
    return `(${values([randomUUID(), workspaceId, importId, row.observed_on, row.detected_hours ?? null, row.valid_hours ?? null, row.efficiency ?? null, row.core_minutes ?? null, row.deep_minutes ?? null, row.rem_minutes ?? null, row.awake_minutes ?? null, row.source_status ?? null, now])})`
  }).join(',\n')};`)
}

function workoutStatements(rows) {
  return chunk(rows, 100).map((batch) => `INSERT OR IGNORE INTO workout_sessions (id, workspace_id, import_source_id, observed_on, activity_type, duration_minutes, distance_km, energy_kcal, average_heart_rate, maximum_heart_rate, running_speed_kmh, route_file_name, source_label, source_row, created_at) VALUES\n${batch.map((raw) => {
    const row = validateWorkout(raw)
    return `(${values([randomUUID(), workspaceId, importId, row.observed_on, row.activity_type, row.duration_minutes ?? null, row.distance_km ?? null, row.energy_kcal ?? null, row.average_heart_rate ?? null, row.maximum_heart_rate ?? null, row.running_speed_kmh ?? null, row.route_file_name ?? null, row.source_label ?? null, row.source_row, now])})`
  }).join(',\n')};`)
}

function executeStatementFiles(statements) {
  const directory = mkdtempSync(join(tmpdir(), 'personal-os-health-'))
  try {
    let fileIndex = 0
    let current = ''
    const flush = () => {
      if (!current) return
      const path = join(directory, `health-${String(fileIndex).padStart(3, '0')}.sql`)
      writeFileSync(path, current, { encoding: 'utf8', mode: 0o600 })
      executeFile(path)
      fileIndex += 1
      current = ''
    }
    for (const statement of statements) {
      if (Buffer.byteLength(current) + Buffer.byteLength(statement) > 700_000) flush()
      current += `${statement}\n`
    }
    flush()
  } finally {
    const resolved = resolve(directory)
    if (!resolved.startsWith(resolve(tmpdir()))) fail('refusing to remove a non-temporary directory')
    rmSync(resolved, { recursive: true, force: true })
  }
}

function importCounts(id) {
  const row = queryOne(`SELECT
    (SELECT count(*) FROM health_daily_metrics WHERE workspace_id = ${sql(workspaceId)} AND import_source_id = ${sql(id)}) AS daily_metrics,
    (SELECT count(*) FROM sleep_sessions WHERE workspace_id = ${sql(workspaceId)} AND import_source_id = ${sql(id)}) AS sleep,
    (SELECT count(*) FROM workout_sessions WHERE workspace_id = ${sql(workspaceId)} AND import_source_id = ${sql(id)}) AS workouts`)
  return { daily_metrics: Number(row?.daily_metrics ?? 0), sleep: Number(row?.sleep ?? 0), workouts: Number(row?.workouts ?? 0) }
}

function executeCommand(command) { runWrangler(['--command', command]) }
function executeFile(path) { runWrangler(['--file', path]) }
function queryOne(command) {
  const output = runWrangler(['--command', command])
  const parsed = JSON.parse(output.slice(output.indexOf('[')))
  if (!parsed[0]?.success) fail('remote D1 query failed')
  return parsed[0].results?.[0] ?? null
}

function runWrangler(tail) {
  const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', database, '--remote', '--config', config, '--json', ...tail], {
    cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  })
  if (result.error) fail(`wrangler could not start: ${result.error.message}`)
  if (result.status !== 0) fail(`wrangler failed: ${String(result.stderr || result.stdout || `exit ${result.status}`).trim()}`)
  return result.stdout.trim()
}

function validatePackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('package must be an object')
  if (value.schema_version !== 'health-workbook-v1') fail('invalid schema_version')
  if (value.source_type != null && !['health_workbook', 'apple_health_export'].includes(value.source_type)) fail('invalid source_type')
  assertHash(value.source_sha256, 'source_sha256')
  if (value.artifact_sha256 != null) assertHash(value.artifact_sha256, 'artifact_sha256')
  assertString(value.source_name, 'source_name', 1, 255)
  if (value.artifact_name != null) assertString(value.artifact_name, 'artifact_name', 1, 255)
  if (value.exported_at != null) assertString(value.exported_at, 'exported_at', 1, 64)
  if (value.upstream_record_count != null) nullableInteger(value.upstream_record_count, 'upstream_record_count', 0, false)
  if (value.coverage_start != null) assertDate(value.coverage_start, 'coverage_start')
  if (value.coverage_end != null) assertDate(value.coverage_end, 'coverage_end')
  if (value.transformation != null) assertString(value.transformation, 'transformation', 1, 100)
  if (value.validation != null && !['pending', 'reconciled'].includes(value.validation)) fail('invalid validation state')
  for (const key of ['daily_metrics', 'sleep', 'workouts']) if (!Array.isArray(value[key])) fail(`${key} must be an array`)
  if ('weights' in value) fail('legacy weight values are not allowed; regenerate the package')
  if (value.excluded_counts != null) {
    assertObject(value.excluded_counts, 'excluded_counts')
    assertOnlyKeys(value.excluded_counts, ['manual_or_estimated_weights'])
    nullableInteger(value.excluded_counts.manual_or_estimated_weights, 'manual_or_estimated_weights', 0)
  }
  if (value.daily_metrics.length > 50_000 || value.sleep.length > 5_000 || value.workouts.length > 5_000) fail('package row limit exceeded')
  return value
}

function validateDaily(row) {
  assertObject(row, 'daily metric')
  assertOnlyKeys(row, ['observed_on','metric_key','source_label','unit','record_count','value_sum','value_avg','value_min','value_max','value_first','value_last'])
  assertDate(row.observed_on, 'observed_on')
  if (!/^[a-z0-9]+([._][a-z0-9]+)*$/.test(row.metric_key)) fail('invalid metric_key')
  assertString(row.source_label, 'source_label', 1, 160)
  assertString(row.unit, 'unit', 1, 24)
  nullableInteger(row.record_count, 'record_count', 0)
  for (const key of ['value_sum','value_avg','value_min','value_max','value_first','value_last']) nullableNumber(row[key], key)
  return row
}

function validateSleep(row) {
  assertObject(row, 'sleep row')
  assertOnlyKeys(row, ['observed_on','detected_hours','valid_hours','efficiency','core_minutes','deep_minutes','rem_minutes','awake_minutes','source_status'])
  assertDate(row.observed_on, 'observed_on')
  for (const key of ['detected_hours','valid_hours','core_minutes','deep_minutes','rem_minutes','awake_minutes']) nullableNumber(row[key], key)
  nullableNumber(row.efficiency, 'efficiency', 0, 1)
  if (row.source_status != null) assertString(row.source_status, 'source_status', 0, 120)
  return row
}

function validateWorkout(row) {
  assertObject(row, 'workout row')
  assertOnlyKeys(row, ['observed_on','activity_type','duration_minutes','distance_km','energy_kcal','average_heart_rate','maximum_heart_rate','running_speed_kmh','route_file_name','source_label','source_row'])
  assertDate(row.observed_on, 'observed_on')
  assertString(row.activity_type, 'activity_type', 1, 120)
  for (const key of ['duration_minutes','distance_km','energy_kcal','average_heart_rate','maximum_heart_rate','running_speed_kmh']) nullableNumber(row[key], key)
  if (row.route_file_name != null) assertString(row.route_file_name, 'route_file_name', 0, 255)
  if (row.source_label != null) assertString(row.source_label, 'source_label', 0, 160)
  nullableInteger(row.source_row, 'source_row', 0, false)
  return row
}

function parseArgs(tokens) {
  const result = {}
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token.startsWith('--')) fail(`unexpected argument ${token}`)
    const key = token.slice(2)
    if (key === 'promote-verified') result[key] = true
    else result[key] = tokens[++index]
  }
  return result
}

function required(value, key) { if (!value[key]) fail(`--${key} is required`); return String(value[key]) }
function sql(value) {
  if (value == null) return 'NULL'
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('non-finite SQL number'); return String(value) }
  return `'${String(value).replaceAll("'", "''")}'`
}
function values(row) { return row.map(sql).join(', ') }
function chunk(rows, size) { const result = []; for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size)); return result }
function assertObject(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`) }
function assertOnlyKeys(value, allowed) { const extra = Object.keys(value).filter((key) => !allowed.includes(key)); if (extra.length) fail(`unexpected keys: ${extra.join(', ')}`) }
function assertString(value, label, minimum, maximum) { if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) fail(`invalid ${label}`) }
function assertDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`invalid ${label}`)
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) fail(`invalid ${label}`)
}
function assertHash(value, label) { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(`invalid ${label}`) }
function assertUuid(value, label) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail(`invalid ${label}`) }
function nullableNumber(value, label, minimum = -Infinity, maximum = Infinity) { if (value == null) return; if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(`invalid ${label}`) }
function nullableInteger(value, label, minimum, nullable = true) { if (value == null && nullable) return; if (!Number.isInteger(value) || value < minimum) fail(`invalid ${label}`) }
function fail(message) { throw new Error(message) }
