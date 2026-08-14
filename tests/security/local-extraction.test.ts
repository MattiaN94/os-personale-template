import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const extraction = readFileSync(resolve('src/lib/extraction.ts'), 'utf8')
const worker = readFileSync(resolve('workers/api/src/index.ts'), 'utf8')
const headers = readFileSync(resolve('public/_headers'), 'utf8')
const app = readFileSync(resolve('src/App.tsx'), 'utf8')
const pwaConfig = readFileSync(resolve('vite.config.ts'), 'utf8')
const vendor = readFileSync(resolve('scripts/vendor_ocr_assets.mjs'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

// These invariants protect a failure that type checking, linting and unit tests
// all pass: a runtime asset fetched from a third-party CDN is blocked by the
// Content-Security-Policy only in the browser, and only in production.
describe('on-device extraction stays same-origin', () => {
  it('pins every Tesseract runtime path to the vendored same-origin directory', () => {
    expect(extraction).toContain("const OCR_BASE = '/tesseract'")
    expect(extraction).toContain('workerPath: `${OCR_BASE}/worker.min.js`')
    expect(extraction).toContain('corePath: OCR_BASE')
    expect(extraction).toContain('langPath: OCR_BASE')
  })

  it('never resolves extraction assets from a third-party origin', () => {
    expect(extraction).not.toMatch(/https?:\/\//)
  })

  it('vendors the core major that tesseract.js itself requests', () => {
    const declared = String(packageJson.dependencies['tesseract.js'])
    expect(declared.startsWith('7')).toBe(true)
    expect(vendor).toContain("const CORE_VERSION = '7.0.0'")
    // The worker picks the core from detected WebAssembly features, so every
    // LSTM variant it can ask for must exist locally.
    expect(vendor).toContain('tesseract-core-relaxedsimd-lstm.wasm.js')
    expect(vendor).toContain('tesseract-core-simd-lstm.wasm.js')
    expect(vendor).toContain('tesseract-core-lstm.wasm.js')
    expect(packageJson.scripts['vendor:ocr']).toBe('node scripts/vendor_ocr_assets.mjs')
  })

  it('grants WebAssembly compilation without granting eval or a remote script host', () => {
    expect(worker).toContain(`scriptSrc: ["'self'", "'wasm-unsafe-eval'"]`)
    expect(headers).toContain("script-src 'self' 'wasm-unsafe-eval'")
    for (const policy of [worker, headers]) {
      expect(policy).not.toContain("'unsafe-eval'\"")
      expect(policy).not.toContain("script-src 'self' 'unsafe-eval'")
    }
    expect(headers).not.toMatch(/(script|connect|worker)-src[^;]*https:\/\//)
  })

  it('archives the document even when the optional excerpt cannot be produced', () => {
    expect(app).toContain('async function extractExcerpt(')
    expect(app).toContain("code === 'ocr_assets_missing'")
    // Both upload paths must route through the tolerant helper, and extraction
    // itself may be called only once — inside it, where a throw is contained.
    expect(app.match(/await extractExcerpt\(file, /g)?.length).toBe(2)
    expect(app.match(/await extractTextLocally\(/g)?.length).toBe(1)
  })

  it('never precaches the multi-megabyte OCR runtime', () => {
    // There is no precache to exclude it from: the OCR assets are fetched only
    // when an image is actually extracted, so no install has to move ~15 MB.
    expect(pwaConfig).toContain('globPatterns: []')
    expect(pwaConfig).toContain('selfDestroying: true')
    expect(pwaConfig).not.toContain('maximumFileSizeToCacheInBytes')
  })
})
