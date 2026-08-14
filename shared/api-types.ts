export interface ApiErrorBody {
  error: { code: string; message: string; request_id: string }
}

export interface ProposalResult {
  batch_id: string
  state: 'proposed' | 'confirmed'
  requires_confirmation: boolean
  risk_reason?: string
  items: Array<{ id: string; kind: string; title: string; effective_date: string; state: string }>
  idempotent_replay?: boolean
}
