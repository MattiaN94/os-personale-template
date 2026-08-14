import { apiRequest } from './api'

export interface HealthImportPackage {
  schema_version: 'health-workbook-v1'
  source_type?: 'health_workbook' | 'apple_health_export'
  source_name: string
  source_sha256: string
  artifact_name?: string
  artifact_sha256?: string
  exported_at?: string | null
  upstream_record_count?: number | null
  coverage_start?: string | null
  coverage_end?: string | null
  transformation?: string
  validation?: 'pending' | 'reconciled'
  import_mode?: 'snapshot' | 'incremental'
  row_counts: { daily_metrics: number; sleep: number; workouts: number }
  excluded_counts?: { manual_or_estimated_weights?: number }
  daily_metrics: Array<Record<string, unknown>>
  sleep: Array<Record<string, unknown>>
  workouts: Array<Record<string, unknown>>
}

export async function importHealthPackage(file: File, workspaceId: string, progress: (message: string) => void) {
  progress('Validazione pacchetto')
  const source = validate(JSON.parse(await file.text()) as unknown)
  const dailyMetrics = healthDailyRows(source)
  const expectedCounts = { daily_metrics: dailyMetrics.length, sleep: source.sleep.length, workouts: source.workouts.length }
  const started = await apiRequest<{ import_id: string; source_id?: string; state: string; idempotent_replay?: boolean }>('/api/imports/health/start', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: workspaceId,
      source_type: source.source_type ?? 'health_workbook',
      source_name: source.source_name,
      source_sha256: source.source_sha256,
      artifact_name: source.artifact_name,
      artifact_sha256: source.artifact_sha256,
      exported_at: source.exported_at,
      upstream_record_count: source.upstream_record_count,
      coverage_start: source.coverage_start,
      coverage_end: source.coverage_end,
      transformation: source.transformation,
      validation: source.validation,
      import_mode: source.import_mode ?? 'snapshot',
      schema_version: source.schema_version,
      expected_counts: expectedCounts,
    }),
  })
  const excludedWeights = source.excluded_counts?.manual_or_estimated_weights ?? 0
  if (started.idempotent_replay && started.state !== 'staged') return { sourceId: started.source_id ?? started.import_id, replay: true, state: started.state, excludedWeights }

  await insertBatches(started.import_id, 'daily_metrics', dailyMetrics, progress)
  await insertBatches(started.import_id, 'sleep', source.sleep, progress)
  await insertBatches(started.import_id, 'workouts', source.workouts, progress)
  progress('Controllo conteggi e messa in revisione')
  const completed = await apiRequest<{ state: string; counts_match: boolean; source_id?: string }>(`/api/imports/health/${started.import_id}/complete`, { method: 'POST', body: '{}' })
  return { sourceId: completed.source_id ?? started.source_id ?? started.import_id, replay: false, state: completed.state, countsMatch: completed.counts_match, excludedWeights }
}

export function healthDailyRows(source: Pick<HealthImportPackage, 'daily_metrics'>) {
  // Manual and estimated weights use the normal proposal flow so their precision
  // remains visible and they cannot silently duplicate Apple Health records.
  return [...source.daily_metrics]
}

async function insertBatches(importId: string, table: 'daily_metrics' | 'sleep' | 'workouts', rows: Array<Record<string, unknown>>, progress: (message: string) => void) {
  for (let start = 0; start < rows.length; start += 100) {
    progress(`${table}: ${Math.min(start + 100, rows.length)} / ${rows.length}`)
    await apiRequest(`/api/imports/health/${importId}/chunk`, { method: 'POST', body: JSON.stringify({ table, rows: rows.slice(start, start + 100) }) })
  }
}

function validate(value: unknown): HealthImportPackage {
  if (!value || typeof value !== 'object') throw new Error('invalid_package')
  const candidate = value as Partial<HealthImportPackage>
  if (candidate.schema_version !== 'health-workbook-v1') throw new Error('invalid_schema_version')
  if (candidate.source_type && !['health_workbook', 'apple_health_export'].includes(candidate.source_type)) throw new Error('invalid_source_type')
  if (candidate.import_mode && !['snapshot', 'incremental'].includes(candidate.import_mode)) throw new Error('invalid_import_mode')
  if (!candidate.source_sha256?.match(/^[0-9a-f]{64}$/)) throw new Error('invalid_source_hash')
  if (candidate.artifact_sha256 && !candidate.artifact_sha256.match(/^[0-9a-f]{64}$/)) throw new Error('invalid_artifact_hash')
  if (!candidate.source_name || candidate.source_name.length > 255) throw new Error('invalid_source_name')
  if (!candidate.row_counts || !Array.isArray(candidate.daily_metrics) || !Array.isArray(candidate.sleep) || !Array.isArray(candidate.workouts)) throw new Error('invalid_rows')
  if ('weights' in candidate) throw new Error('legacy_weight_values_not_allowed')
  const excludedWeights = candidate.excluded_counts?.manual_or_estimated_weights
  if (excludedWeights != null && (!Number.isInteger(excludedWeights) || excludedWeights < 0)) throw new Error('invalid_excluded_counts')
  if (candidate.daily_metrics.length > 50_000 || candidate.sleep.length > 5_000 || candidate.workouts.length > 5_000) throw new Error('row_limit_exceeded')
  return candidate as HealthImportPackage
}
