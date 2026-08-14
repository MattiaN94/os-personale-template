export function rateLimitPolicy(group: string, actorType: 'owner' | 'gpt', pathname: string) {
  if (group === 'pwa' && actorType === 'owner' && pathname.startsWith('/api/imports/health/')) {
    return { group: 'pwa-health-import', maximum: 240 }
  }
  return { group, maximum: actorType === 'gpt' ? 30 : 120 }
}
