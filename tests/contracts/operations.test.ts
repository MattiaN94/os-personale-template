import { describe, expect, it } from 'vitest'
import { inferEvidenceStatus, operationSchema, proposeOperationsSchema, requiresExplicitConfirmation } from '../../shared/contracts'

const workspaceId = '6dcd4ce2-5065-4e1e-b1aa-5cc99f63b2e7'

describe('operation contracts', () => {
  it('keeps monthly investments as independent dated events', () => {
    const july = operationSchema.parse({ kind: 'investment', effective_date: '2026-07-10', title: 'PAC July', payload: { instrument_code: 'ETF_A', amount: 300 } })
    const august = operationSchema.parse({ kind: 'investment', effective_date: '2026-08-10', title: 'PAC August', payload: { instrument_code: 'ETF_B', amount: 300 } })
    expect(july.effective_date).not.toBe(august.effective_date)
    expect(july.payload.instrument_code).toBe('ETF_A')
    expect(august.payload.instrument_code).toBe('ETF_B')
  })

  it('links corrections without mutating another month', () => {
    const originalId = 'd9428888-122b-11e1-b85c-61cd3cbb3210'
    const correction = operationSchema.parse({ kind: 'investment', effective_date: '2026-07-10', title: 'Correct July PAC', supersedes_item_id: originalId, payload: { instrument_code: 'ETF_A', amount: 350 } })
    expect(correction.supersedes_item_id).toBe(originalId)
    expect(correction.effective_date).toBe('2026-07-10')
  })

  it('requires confirmation for finance, health, corrections and documents', () => {
    const base = { workspace_id: workspaceId, idempotency_key: 'test-key-123', source: 'direct_user_statement' as const }
    const finance = proposeOperationsSchema.parse({ ...base, operations: [{ kind: 'investment', effective_date: '2026-07-10', title: 'PAC', payload: { instrument_code: 'ETF_A', amount: 300 } }] })
    const health = proposeOperationsSchema.parse({ ...base, idempotency_key: 'test-key-124', operations: [{ kind: 'measurement', effective_date: '2026-08-12', title: 'Weight', payload: { metric_key: 'body.weight', value: 73.2, unit: 'kg', measured_at: '2026-08-12T08:00:00+02:00' } }] })
    expect(requiresExplicitConfirmation(finance)).toBe(true)
    expect(requiresExplicitConfirmation(health)).toBe(true)
  })

  it('accepts only bounded structured operations', () => {
    const parsed = operationSchema.safeParse({ kind: 'investment', effective_date: '2026-08-10', title: 'PAC', payload: { instrument_code: 'etf_b', amount: -10 } })
    expect(parsed.success).toBe(false)
  })

  it('accepts a negative utility amount as a documented credit', () => {
    const result = operationSchema.parse({ kind: 'utility_bill', effective_date: '2026-08-10', title: 'Conguaglio energia', payload: { provider: 'Utility', utility_type: 'electricity', amount: -25, currency: 'EUR' } })
    expect(result.payload.amount).toBe(-25)
  })

  it('rejects unconverted currencies because dashboard aggregates are EUR', () => {
    expect(operationSchema.safeParse({ kind: 'transaction', effective_date: '2026-08-10', title: 'Foreign expense', payload: { amount: 10, currency: 'USD', direction: 'expense', category: 'Travel' } }).success).toBe(false)
  })

  it('versions deadline lifecycle without deleting the original', () => {
    const open = operationSchema.parse({ kind: 'deadline', effective_date: '2026-09-01', title: 'Rinnovo', payload: { due_at: '2026-09-01T09:00:00+02:00', category: 'Casa', precision: 'exact' } })
    const completed = operationSchema.parse({ kind: 'deadline', effective_date: '2026-09-01', title: 'Rinnovo', supersedes_item_id: 'd9428888-122b-11e1-b85c-61cd3cbb3210', payload: { ...open.payload, status: 'completed' } })
    expect(open.payload.status).toBe('open')
    expect(completed.payload.status).toBe('completed')
    expect(completed.supersedes_item_id).toBeDefined()
  })

  it('separates evidence status from version lifecycle', () => {
    const declared = proposeOperationsSchema.parse({ workspace_id: workspaceId, idempotency_key: 'evidence-direct-1', source: 'direct_user_statement', operations: [{ kind: 'fact', effective_date: '2026-08-13', title: 'Preference', payload: { category: 'profile.constitution', value: 'Active' } }] })
    const estimated = proposeOperationsSchema.parse({ workspace_id: workspaceId, idempotency_key: 'evidence-calc-1', source: 'calculation', operations: [{ kind: 'financial_snapshot', effective_date: '2026-08-13', title: 'Estimate', payload: { metric_key: 'net_worth', amount: 100, precision: 'estimated' } }] })
    expect(inferEvidenceStatus(declared, declared.operations[0])).toBe('declared')
    expect(inferEvidenceStatus(estimated, estimated.operations[0])).toBe('estimated')
  })

  it('accepts bounded structured Core+ details', () => {
    const meal = operationSchema.parse({ kind: 'fact', effective_date: '2026-08-13', title: 'Pranzo da foto', evidence_status: 'estimated', payload: { category: 'nutrition.meal', key: 'nutrition.meal.20260813.lunch', value: 'Pasto stimato', sensitivity: 'health', details: { meal_type: 'lunch', calories: 620, uncertainty_kcal: 120, confidence_label: 'medium', tags: ['photo','nutrition'] } } })
    expect(meal.payload.details?.uncertainty_kcal).toBe(120)
    expect(meal.evidence_status).toBe('estimated')
  })
})
