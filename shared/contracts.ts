import { z } from 'zod'

// Every aggregate in this single-user Italian workspace has EUR as its base.
// Rejecting unconverted currencies prevents mathematically invalid totals.
const currency = z.literal('EUR').default('EUR')
const isoDate = z.iso.date()
const shortText = z.string().trim().min(1).max(200)

const baseOperation = {
  effective_date: isoDate,
  title: shortText,
  supersedes_item_id: z.uuid().optional(),
  source_document_id: z.uuid().optional(),
  confidence: z.number().min(0).max(1).default(1),
  evidence_status: z.enum(['verified', 'declared', 'estimated', 'planned']).optional(),
}

const precision = z.enum(['exact', 'estimated', 'derived'])
const sensitivity = z.enum(['normal', 'personal', 'financial', 'health', 'identity', 'highly_restricted'])
const detailValue = z.union([
  z.string().trim().max(2000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().trim().max(120)).max(12),
])
const structuredDetails = z.record(z.string().regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/), detailValue)
  .refine((value) => Object.keys(value).length <= 24, { message: 'details can contain at most 24 fields' })

export const operationSchema = z.discriminatedUnion('kind', [
  z.object({
    ...baseOperation,
    kind: z.literal('investment'),
    payload: z.object({
      instrument_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{2,20}$/),
      amount: z.number().positive().optional(),
      quantity: z.number().positive().optional(),
      currency,
      account_label: z.string().trim().max(80).optional(),
    }).refine((value) => value.amount !== undefined || value.quantity !== undefined, {
      message: 'amount or quantity is required',
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.enum(['financial_snapshot', 'mortgage_snapshot']),
    payload: z.object({
      metric_key: z.string().regex(/^[a-z0-9]+([._][a-z0-9]+)*$/),
      amount: z.number().finite(),
      currency,
      precision,
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.enum(['account_balance', 'asset_valuation', 'liability_snapshot', 'pension_snapshot']),
    payload: z.object({
      account_or_asset_id: z.string().trim().min(1).max(120),
      institution: z.string().trim().max(120).optional(),
      category: z.string().trim().min(1).max(80),
      amount: z.number().finite(),
      currency,
      precision,
      ownership_share: z.number().min(0).max(1).optional(),
      identifier_last4: z.string().trim().max(8).optional(),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.literal('insurance_policy'),
    payload: z.object({
      provider: z.string().trim().min(1).max(120),
      policy_type: z.string().trim().min(1).max(80),
      policy_number_last4: z.string().trim().max(8).optional(),
      annual_premium: z.number().nonnegative().optional(),
      currency,
      starts_on: isoDate.optional(),
      expires_on: isoDate.optional(),
      renewal: z.enum(['automatic', 'manual', 'none', 'unknown']).default('unknown'),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.literal('transaction'),
    payload: z.object({
      amount: z.number().positive(),
      currency,
      direction: z.enum(['income', 'expense', 'transfer', 'liability_settlement']),
      category: z.string().trim().min(1).max(80),
      counterparty: z.string().trim().max(120).optional(),
      account_label: z.string().trim().max(80).optional(),
      reconciles_item_id: z.uuid().optional(),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.enum(['recurring_commitment', 'budget_target']),
    payload: z.object({
      category: z.string().trim().min(1).max(80),
      amount: z.number().nonnegative(),
      currency,
      cadence: z.enum(['weekly', 'monthly', 'quarterly', 'annual', 'one_off']),
      starts_on: isoDate.optional(),
      ends_on: isoDate.optional(),
      counterparty: z.string().trim().max(120).optional(),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.literal('utility_bill'),
    payload: z.object({
      provider: z.string().trim().min(1).max(120),
      utility_type: z.enum(['electricity', 'gas', 'water', 'internet', 'mobile', 'waste', 'other']),
      period_start: isoDate.optional(),
      period_end: isoDate.optional(),
      due_on: isoDate.optional(),
      amount: z.number().finite(),
      currency,
      consumption: z.number().nonnegative().optional(),
      consumption_unit: z.string().trim().max(24).optional(),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.literal('lab_result'),
    payload: z.object({
      test_key: z.string().regex(/^[a-z0-9]+([._][a-z0-9]+)*$/),
      value: z.union([z.number().finite(), z.string().trim().max(120)]),
      unit: z.string().trim().max(24).optional(),
      reference_range: z.string().trim().max(120).optional(),
      observed_at: z.iso.datetime({ offset: true }),
      flag: z.enum(['normal', 'low', 'high', 'critical', 'unknown']).default('unknown'),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.enum(['medication', 'diagnosis', 'vaccination', 'appointment']),
    payload: z.object({
      category: z.string().trim().min(1).max(80),
      status: z.string().trim().min(1).max(80),
      provider: z.string().trim().max(120).optional(),
      occurred_at: z.iso.datetime({ offset: true }).optional(),
      details: z.string().trim().max(2000).optional(),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.literal('measurement'),
    payload: z.object({
      metric_key: z.string().regex(/^[a-z0-9]+([._][a-z0-9]+)*$/),
      value: z.number().finite(),
      unit: z.string().trim().min(1).max(24),
      measured_at: z.iso.datetime({ offset: true }),
      person_id: z.uuid().optional(),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.literal('deadline'),
    payload: z.object({
      due_at: z.iso.datetime({ offset: true }),
      category: z.string().trim().min(1).max(80),
      precision: z.enum(['exact', 'derived', 'estimated']),
      remind_days_before: z.array(z.number().int().min(0).max(365)).max(8).default([30, 7, 1]),
      status: z.enum(['open', 'completed', 'cancelled']).default('open'),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.literal('event'),
    payload: z.object({
      category: z.string().trim().min(1).max(80),
      started_at: z.iso.datetime({ offset: true }),
      ended_at: z.iso.datetime({ offset: true }).optional(),
      precision: z.enum(['exact', 'day', 'month', 'estimated']).default('exact'),
      notes: z.string().trim().max(2000).optional(),
      impact_domains: z.array(z.enum(['finance','health','home','deadlines','personal'])).max(5).optional(),
      status: z.enum(['planned','active','completed','cancelled']).optional(),
      details: structuredDetails.optional(),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.literal('document'),
    payload: z.object({
      document_type: z.string().trim().min(1).max(80),
      document_date: isoDate.optional(),
      sensitivity,
      masked_summary: z.string().trim().max(2000).optional(),
    }),
  }),
  z.object({
    ...baseOperation,
    kind: z.enum(['fact', 'note']),
    payload: z.object({
      category: z.string().trim().min(1).max(80),
      key: z.string().regex(/^[a-z0-9]+([._][a-z0-9]+)*$/).optional(),
      value: z.union([z.string().max(2000), z.number(), z.boolean()]),
      sensitivity: sensitivity.default('personal'),
      details: structuredDetails.optional(),
    }),
  }),
])

export const proposeOperationsSchema = z.object({
  workspace_id: z.uuid(),
  idempotency_key: z.string().trim().min(8).max(160),
  source: z.enum(['direct_user_statement', 'document_extraction', 'import', 'calculation', 'integration']),
  source_id: z.uuid().optional(),
  source_label: z.string().trim().max(160).optional(),
  operations: z.array(operationSchema).min(1).max(20),
})

export const decisionSchema = z.object({
  note: z.string().trim().max(500).optional(),
})

export const correctionSchema = z.object({
  workspace_id: z.uuid(),
  original_item_id: z.uuid(),
  idempotency_key: z.string().trim().min(8).max(160),
  source_label: z.string().trim().max(160).optional(),
  replacement: operationSchema,
})

export const contextQuerySchema = z.object({
  domain: z.enum(['overview', 'profile', 'finance', 'health', 'home', 'documents', 'deadlines', 'insights']).default('overview'),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export const searchQuerySchema = z.object({
  query: z.string().trim().min(2).max(120),
  kind: z.enum(['all', 'investment', 'measurement', 'deadline', 'utility_bill', 'financial_snapshot', 'account_balance', 'liability_snapshot', 'insurance_policy', 'fact', 'note', 'event']).default('all'),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type Operation = z.infer<typeof operationSchema>
export type ProposeOperations = z.infer<typeof proposeOperationsSchema>
export type ContextQuery = z.infer<typeof contextQuerySchema>

const sensitiveKinds = new Set([
  'investment', 'account_balance', 'financial_snapshot', 'asset_valuation', 'liability_snapshot',
  'mortgage_snapshot', 'pension_snapshot', 'insurance_policy', 'transaction', 'recurring_commitment',
  'budget_target', 'utility_bill', 'measurement', 'lab_result', 'medication', 'diagnosis',
  'vaccination', 'appointment', 'document',
])

export function requiresExplicitConfirmation(input: ProposeOperations): boolean {
  if (input.source !== 'direct_user_statement') return true
  return input.operations.some((operation) =>
    sensitiveKinds.has(operation.kind) || operation.supersedes_item_id !== undefined ||
    ('sensitivity' in operation.payload && ['financial', 'health', 'identity', 'highly_restricted'].includes(String(operation.payload.sensitivity))),
  )
}

export function inferEvidenceStatus(input: ProposeOperations, operation: Operation) {
  if (input.source === 'calculation') return 'estimated' as const
  if (operation.evidence_status) return operation.evidence_status
  if (operation.kind === 'deadline') return 'planned' as const
  if (operation.kind === 'event' && operation.payload.status === 'planned') return 'planned' as const
  return 'declared' as const
}

export function operationSensitivity(operation: Operation) {
  if (['measurement', 'lab_result', 'medication', 'diagnosis', 'vaccination', 'appointment'].includes(operation.kind)) return 'health'
  if (['investment', 'account_balance', 'financial_snapshot', 'asset_valuation', 'liability_snapshot', 'mortgage_snapshot', 'pension_snapshot', 'insurance_policy', 'transaction', 'recurring_commitment', 'budget_target', 'utility_bill'].includes(operation.kind)) return 'financial'
  if (operation.kind === 'document') return operation.payload.sensitivity
  if (operation.kind === 'fact' || operation.kind === 'note') return operation.payload.sensitivity
  return 'personal'
}
