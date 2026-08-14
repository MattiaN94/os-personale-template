const apiBase = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const liveMode = import.meta.env.PROD || import.meta.env.VITE_LIVE_API === 'true'

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof Blob) && !(init.body instanceof ArrayBuffer)) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
    })
  } catch {
    throw new Error('access_session_unavailable')
  }
  if (response.type === 'opaqueredirect' || response.status === 0) throw new Error('access_session_expired')
  if (response.status >= 300 && response.status < 400) throw new Error('access_session_expired')
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    if ([401, 403].includes(response.status) && !contentType.includes('application/json')) throw new Error('access_session_expired')
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
    throw new Error(body?.error?.code ?? `http_${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) throw new Error('unexpected_api_response')
  return response.json() as Promise<T>
}

export function getSession() {
  return apiRequest<{ email: string; workspace: { id: string; name: string }; access: string; mfa_policy: string }>('/api/session')
}

export function getDashboard<T>() { return apiRequest<T>('/api/dashboard') }

export function getHealthSeries<T>(metricKey: string, from?: string, to?: string) {
  const query = new URLSearchParams({ metric_key: metricKey, limit: '3000' })
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  return apiRequest<{ metric_key: string; rows: T[]; coverage: { returned: number; total: number; truncated: boolean } }>(`/api/health-series?${query}`)
}

export function proposeOperations(input: Record<string, unknown>) {
  return apiRequest<{ batch_id: string; state: string }>('/api/operations/propose', { method: 'POST', body: JSON.stringify(input) })
}

export function decideBatch(batchId: string, decision: 'confirm' | 'reject', note?: string) {
  return apiRequest<{ batch_id: string; state: string }>(`/api/operations/${batchId}/${decision}`, { method: 'POST', body: JSON.stringify(note ? { note } : {}) })
}

export function decideSource(sourceId: string, decision: 'verified' | 'rejected', note?: string) {
  return apiRequest<{ source_id: string; state: string }>(`/api/sources/${sourceId}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) })
}

export function runBackup() {
  return apiRequest<{ state: 'completed'; backup_id: string }>('/api/backups/run', { method: 'POST', body: '{}' })
}

export function verifyBackup(backupId: string) {
  return apiRequest<{ verified: true; backup_id: string; table_count: number; row_counts: Record<string, number> }>(`/api/backups/${backupId}/verify`, { method: 'POST', body: '{}' })
}

export function verifyUploadGrant(tokenHash: string) {
  return apiRequest<{ id: string; workspace_id: string; intended_sensitivity: 'normal' | 'personal' | 'financial' | 'health' | 'identity' | 'highly_restricted' }>('/api/upload-grants/verify', { method: 'POST', body: JSON.stringify({ token_hash: tokenHash }) })
}

export function consumeUploadGrant(tokenHash: string) {
  return apiRequest<{ consumed: boolean }>('/api/upload-grants/consume', { method: 'POST', body: JSON.stringify({ token_hash: tokenHash }) })
}

export function accessLogout() { window.location.assign('/cdn-cgi/access/logout') }
