import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { webcrypto } from 'node:crypto'

const MAGIC = Buffer.from('PERSONALOSB1', 'ascii')
const TABLES = [
  'workspaces', 'documents', 'sources', 'operation_batches', 'operation_items',
  'import_sources', 'health_daily_metrics', 'sleep_sessions',
  'workout_sessions', 'google_calendar_connections', 'google_calendar_sync_items',
  'data_quality_issues', 'regulatory_rules', 'benefit_opportunities',
  'monitor_runs', 'backup_runs', 'audit_events',
]

const options = parseArgs(process.argv.slice(2))
if (!options.encrypted || !options.keyFile) usage()

const encryptedPath = resolve(options.encrypted)
const keyPath = resolve(options.keyFile)
const projectRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..')
const temporaryRoot = options.persistTo ? resolve(options.persistTo) : await mkdtemp(join(tmpdir(), 'personal-os-restore-'))
const sqlPath = join(temporaryRoot, 'restore.sql')

try {
  await mkdir(temporaryRoot, { recursive: true })
  const envelope = await readFile(encryptedPath)
  const key = Buffer.from((await readFile(keyPath, 'utf8')).trim(), 'base64')
  if (key.byteLength !== 32) throw new Error('The recovery key must contain exactly 32 base64-decoded bytes.')
  if (envelope.byteLength < MAGIC.byteLength + 12 + 16 || !envelope.subarray(0, MAGIC.byteLength).equals(MAGIC)) {
    throw new Error('Not a self-contained Personal OS backup envelope.')
  }

  const ivStart = MAGIC.byteLength
  const cipherStart = ivStart + 12
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt'])
  const clear = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: envelope.subarray(ivStart, cipherStart) },
    cryptoKey,
    envelope.subarray(cipherStart),
  )
  const backup = validateBackup(JSON.parse(Buffer.from(clear).toString('utf8')))
  await writeFile(sqlPath, buildSql(backup.data), 'utf8')

  runWrangler([
    'd1', 'migrations', 'apply', 'personal-os', '--local', '--persist-to', temporaryRoot,
    '--config', join(projectRoot, 'workers', 'api', 'wrangler.jsonc'),
  ], projectRoot)
  runWrangler([
    'd1', 'execute', 'personal-os', '--local', '--persist-to', temporaryRoot,
    '--config', join(projectRoot, 'workers', 'api', 'wrangler.jsonc'), '--file', sqlPath,
  ], projectRoot)

  const countQuery = TABLES.map((table) => `SELECT '${table}' AS table_name, COUNT(*) AS row_count FROM "${table}"`).join('; ')
  const verification = runWrangler([
    'd1', 'execute', 'personal-os', '--local', '--persist-to', temporaryRoot,
    '--config', join(projectRoot, 'workers', 'api', 'wrangler.jsonc'), '--command', countQuery, '--json',
  ], projectRoot, true)
  const actual = parseWranglerCounts(verification)
  for (const table of TABLES) {
    const expected = backup.data[table].length
    if (actual.get(table) !== expected) throw new Error(`Row-count mismatch for ${table}: expected ${expected}, got ${actual.get(table)}`)
  }

  console.log(`Verified ${TABLES.length} tables from ${basename(encryptedPath)} in a disposable local D1 database.`)
  console.log(`Workspace: ${backup.workspace_id}`)
  if (options.persistTo) console.log(`Local restore retained at: ${temporaryRoot}`)
} finally {
  if (!options.persistTo) await rm(temporaryRoot, { recursive: true, force: true })
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index]
    const value = values[index + 1]
    if (key === '--encrypted') { parsed.encrypted = value; index += 1 }
    else if (key === '--key-file') { parsed.keyFile = value; index += 1 }
    else if (key === '--persist-to') { parsed.persistTo = value; index += 1 }
    else throw new Error(`Unknown or incomplete option: ${key}`)
  }
  return parsed
}

function usage() {
  console.error('Usage: node scripts/restore_backup.mjs --encrypted <backup.json.enc> --key-file <base64-key-file> [--persist-to <directory>]')
  process.exit(2)
}

function validateBackup(value) {
  if (!value || value.schema !== 'personal-os-d1-v1' || typeof value.workspace_id !== 'string' || !value.data || typeof value.data !== 'object') {
    throw new Error('Backup schema is invalid.')
  }
  for (const table of TABLES) {
    const rows = value.data[table]
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`Backup table ${table} is invalid.`)
    }
  }
  const unexpected = Object.keys(value.data).filter((table) => !TABLES.includes(table))
  if (unexpected.length) throw new Error(`Unexpected backup tables: ${unexpected.join(', ')}`)
  return value
}

function buildSql(data) {
  const statements = [
    'PRAGMA foreign_keys = OFF;',
    'DELETE FROM "regulatory_rules";',
    'DELETE FROM "benefit_opportunities";',
  ]
  for (const table of TABLES) {
    for (const row of data[table]) {
      const columns = Object.keys(row)
      if (!columns.length || columns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))) throw new Error(`Unsafe column in ${table}`)
      const names = columns.map((column) => `"${column}"`).join(', ')
      const values = columns.map((column) => sqlLiteral(row[column])).join(', ')
      statements.push(`INSERT INTO "${table}" (${names}) VALUES (${values});`)
    }
  }
  statements.push('PRAGMA foreign_keys = ON;')
  return `${statements.join('\n')}\n`
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number in backup')
    return String(value)
  }
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value !== 'string') throw new Error(`Unsupported backup value type: ${typeof value}`)
  return `'${value.replaceAll("'", "''")}'`
}

function runWrangler(args, cwd, capture = false) {
  const wranglerCli = join(cwd, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const result = spawnSync(process.execPath, [wranglerCli, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      XDG_CONFIG_HOME: join(tmpdir(), 'personal-os-wrangler-config'),
    },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `Wrangler failed with exit code ${result.status}`)
  return result.stdout || ''
}

function parseWranglerCounts(output) {
  const parsed = JSON.parse(output)
  const rows = parsed.flatMap((entry) => entry.results || [])
  return new Map(rows.map((row) => [String(row.table_name), Number(row.row_count)]))
}
