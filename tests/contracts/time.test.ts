import { describe, expect, it } from 'vitest'
import { europeRomeDateTime } from '../../shared/time'

describe('Europe/Rome deadlines', () => {
  it('uses the legal summer and winter offsets', () => {
    expect(europeRomeDateTime('2026-01-15')).toBe('2026-01-15T09:00:00+01:00')
    expect(europeRomeDateTime('2026-07-15')).toBe('2026-07-15T09:00:00+02:00')
    expect(europeRomeDateTime('2026-07-15', 17, 45)).toBe('2026-07-15T17:45:00+02:00')
  })

  it('rejects impossible dates', () => {
    expect(() => europeRomeDateTime('2026-02-30')).toThrow('invalid_local_datetime')
    expect(() => europeRomeDateTime('2026-02-28', 10, 60)).toThrow('invalid_local_datetime')
  })
})
