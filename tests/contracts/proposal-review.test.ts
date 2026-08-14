import { describe, expect, it } from 'vitest'
import { proposalComparison } from '../../shared/proposal-review'

describe('proposal review comparison', () => {
  it('shows changed, added and removed fields in a correction', () => {
    const fields = proposalComparison(
      { instrument_code: 'ETF_A', amount: 350, currency: 'EUR' },
      { instrument_code: 'ETF_A', amount: 300, note: 'stima' },
    )

    expect(fields).toEqual([
      { key: 'instrument_code', before: 'ETF_A', after: 'ETF_A', changed: false },
      { key: 'amount', before: 300, after: 350, changed: true },
      { key: 'note', before: 'stima', after: undefined, changed: true },
      { key: 'currency', before: undefined, after: 'EUR', changed: true },
    ])
  })

  it('lists every field for a new proposal', () => {
    expect(proposalComparison({ metric_key: 'body.weight', value: 73.2, unit: 'kg' }))
      .toHaveLength(3)
  })
})
