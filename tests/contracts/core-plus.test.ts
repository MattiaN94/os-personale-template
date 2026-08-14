import { describe, expect, it } from 'vitest'
import { buildCorePlus } from '../../shared/core-plus'

describe('Core+ summaries', () => {
  it('limits the daily brief and keeps estimates visible', () => {
    const result = buildCorePlus({
      today: '2026-08-13',
      pending: [
        { id: 'p1', source_label: 'Health proposal', risk_reason: 'Review', created_at: '2026-08-13T08:00:00Z' },
        { id: 'p2', source_label: 'Finance proposal', risk_reason: 'Review', created_at: '2026-08-13T08:01:00Z' },
      ],
      records: [
        { id: 'r1', kind: 'deadline', title: 'Bill', effective_date: '2026-08-14', state: 'confirmed', evidence_status: 'planned', payload: { due_at: '2026-08-14T08:00:00+02:00', status: 'open', category: 'Casa' } },
        { id: 'r2', kind: 'financial_snapshot', title: 'Estimated worth', effective_date: '2026-08-01', state: 'confirmed', evidence_status: 'estimated', payload: { amount: 100, metric_key: 'net_worth' } },
      ],
      sources: [], issues: [], documents: [], sleep: [], workouts: [],
    })
    expect(result.brief.priorities).toHaveLength(3)
    expect(result.insights.some((row) => row.title === 'Stime ancora da sostituire')).toBe(true)
    expect(result.data_health.domains.find((row) => row.domain === 'finance')?.status).toBe('partial')
  })

  it('requires enough observations before comparing sleep', () => {
    const result = buildCorePlus({
      today: '2026-08-13', pending: [], records: [], sources: [], issues: [], documents: [], workouts: [],
      sleep: [{ id: 's1', observed_on: '2026-08-12', valid_hours: 7 }],
    })
    expect(result.insights.some((row) => row.title === 'Sonno medio settimanale')).toBe(false)
  })

  it('excludes expired commitments and unconfirmed documents from current summaries', () => {
    const result = buildCorePlus({
      today: '2026-08-13', pending: [], sources: [], issues: [], sleep: [], workouts: [],
      documents: [{ id: 'staged', state: 'staged', created_at: '2026-08-13T08:00:00Z' }],
      records: [
        { id: 'old', kind: 'recurring_commitment', title: 'Old', effective_date: '2025-01-01', state: 'confirmed', payload: { amount: 1_200, cadence: 'annual', ends_on: '2025-12-31' } },
        { id: 'active', kind: 'recurring_commitment', title: 'Active', effective_date: '2026-01-01', state: 'confirmed', payload: { amount: 50, cadence: 'monthly', starts_on: '2026-01-01' } },
      ],
    })
    expect(result.brief.monthly_commitments_eur).toBe(50)
    expect(result.data_health.domains.find((row) => row.domain === 'documents')?.record_count).toBe(0)
  })

  it('reports a zero data-health index for a workspace holding no data', () => {
    const result = buildCorePlus({
      today: '2026-08-14', pending: [], records: [], sources: [], issues: [], documents: [], sleep: [], workouts: [],
    })
    // Domains needing no external source previously earned the sourcing credit
    // while empty, so a brand-new workspace reported 8% across six domains.
    expect(result.data_health.score).toBe(0)
    for (const domain of result.data_health.domains) {
      expect(domain.score).toBe(0)
      expect(domain.status).toBe('missing')
      expect(domain.record_count).toBe(0)
    }
  })

  it('still credits sourcing once a domain that needs no external source has content', () => {
    const result = buildCorePlus({
      today: '2026-08-14', pending: [], sources: [], issues: [], documents: [], sleep: [], workouts: [],
      records: [{ id: 'c1', kind: 'fact', title: 'Costituzione', effective_date: '2026-08-14', state: 'confirmed', evidence_status: 'declared', payload: { category: 'profile.constitution' } }],
    })
    const profile = result.data_health.domains.find((row) => row.domain === 'profile')
    expect(profile?.score).toBe(100)
    expect(profile?.status).toBe('complete')
  })
})
