import { describe, expect, it } from 'vitest'
import { rateLimitPolicy } from '../../shared/rate-limit'

describe('rate limit profiles', () => {
  it('allows the owner to upload a full health package without weakening other routes', () => {
    expect(rateLimitPolicy('pwa', 'owner', '/api/imports/health/import-id/chunk'))
      .toEqual({ group: 'pwa-health-import', maximum: 240 })
    expect(rateLimitPolicy('pwa', 'owner', '/api/operations/propose'))
      .toEqual({ group: 'pwa', maximum: 120 })
    expect(rateLimitPolicy('gpt', 'gpt', '/v1/operations/propose'))
      .toEqual({ group: 'gpt', maximum: 30 })
  })
})
