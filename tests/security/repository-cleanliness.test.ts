import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split(/\r?\n/).filter((path) => path && existsSync(path))

describe('repository cleanliness', () => {
  it('tracks no private source documents, exports, backups or retired modules', () => {
    expect(tracked.some((path) => /(?:^|\/)(?:private-data|imports|exports|backups|quarantine)(?:\/|$)/i.test(path))).toBe(false)
    expect(tracked.some((path) => /\.(?:xlsx?|csv|tsv|pdf|p12|pem|key|age|dump)$/i.test(path))).toBe(false)
    expect(tracked.some((path) => /^(?:examples|workers\/bootstrap)\//.test(path))).toBe(false)
  })

  it('contains no retired personal examples or local attachment paths', () => {
    const text = tracked.filter((path) => path !== 'tests/security/repository-cleanliness.test.ts')
      .filter((path) => /\.(?:ts|tsx|js|mjs|json|jsonc|md|yaml|yml|sql|ps1|py|css|html)$/.test(path))
      .map((path) => readFileSync(path, 'utf8')).join('\n')
    expect(text).not.toMatch(/\b(?:EIMI|MWRD)\b/)
    expect(text).not.toMatch(/monitoraggio_salute_integrato|Mr RIP Net Worth|codex-remote-attachments/i)
    expect(text).not.toMatch(/[A-Z]:\\Users\\[^\s]+\\Downloads\\/i)
  })
})
