import { apiRequest } from './api'

async function calendarRequest(path: string, workspaceId: string) {
  return apiRequest(path, { method: 'POST', body: JSON.stringify({ workspace_id: workspaceId }) })
}
export async function connectGoogleCalendar(workspaceId: string) {
  const result = await calendarRequest('/api/calendar/connect', workspaceId) as { authorize_url: string }
  window.location.assign(result.authorize_url)
}

export async function syncGoogleCalendar(workspaceId: string) {
  return calendarRequest('/api/calendar/sync', workspaceId) as Promise<{ synchronized: number }>
}

export async function disconnectGoogleCalendar(workspaceId: string) {
  return calendarRequest('/api/calendar/disconnect', workspaceId) as Promise<{ disconnected: boolean }>
}
