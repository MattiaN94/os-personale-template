import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('repository hygiene', () => {
  it('ignores personal data and secret file classes', () => {
    const output = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
      input: ['private-data/health.json', 'imports/source.xlsx', 'backups/db.dump', '.env', 'identity.pdf'].join('\n'),
      encoding: 'utf8',
    })
    expect(output.trim().split(/\r?\n/)).toHaveLength(5)
  })
})
