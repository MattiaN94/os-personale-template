export interface ProposalComparisonField {
  key: string
  before: unknown
  after: unknown
  changed: boolean
}

export function proposalComparison(
  proposed: Record<string, unknown>,
  previous?: Record<string, unknown>,
): ProposalComparisonField[] {
  const keys = [...new Set([...Object.keys(previous ?? {}), ...Object.keys(proposed)])]
  return keys.map((key) => ({
    key,
    before: previous?.[key],
    after: proposed[key],
    changed: !sameProposalValue(previous?.[key], proposed[key]),
  }))
}

export function sameProposalValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}
