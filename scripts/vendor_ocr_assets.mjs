// Vendors the local OCR runtime into public/tesseract so image extraction runs
// entirely on the owner device and never contacts a third-party CDN. The strict
// Content-Security-Policy of the Worker only allows same-origin scripts, workers
// and fetches: without these files the browser blocks Tesseract before it starts.
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targetDirectory = resolve(projectRoot, 'public/tesseract')
// Must track the tesseract.js-core range declared by tesseract.js: the worker
// picks the core filename itself, so a mismatched major would 404 at runtime.
const CORE_VERSION = '7.0.0'
const TESSDATA = 'https://tessdata.projectnaptha.com/4.0.0_fast'
const core = (name) => ({ name, url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/${name}`, minimumBytes: 3_000_000 })

// All three LSTM cores are vendored because the worker chooses between them from
// the WebAssembly features it detects on the device, not from configuration.
// Minimum plausible size guards a truncated or error-page download, which would
// otherwise be published as a valid asset and fail only inside the browser.
const assets = [
  { name: 'worker.min.js', from: resolve(projectRoot, 'node_modules/tesseract.js/dist/worker.min.js'), minimumBytes: 20_000 },
  core('tesseract-core-relaxedsimd-lstm.wasm.js'),
  core('tesseract-core-simd-lstm.wasm.js'),
  core('tesseract-core-lstm.wasm.js'),
  { name: 'eng.traineddata.gz', url: `${TESSDATA}/eng.traineddata.gz`, minimumBytes: 1_000_000 },
  { name: 'ita.traineddata.gz', url: `${TESSDATA}/ita.traineddata.gz`, minimumBytes: 1_000_000 },
]

async function existingSize(path) {
  try { return (await stat(path)).size } catch { return 0 }
}

async function collect(asset) {
  if (asset.from) return new Uint8Array(await readFile(asset.from))
  const response = await fetch(asset.url)
  if (!response.ok) throw new Error(`${asset.name}: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

await mkdir(targetDirectory, { recursive: true })
const report = []
for (const asset of assets) {
  const target = resolve(targetDirectory, asset.name)
  if (await existingSize(target) >= asset.minimumBytes) {
    report.push(`= ${asset.name} (già presente)`)
    continue
  }
  const bytes = await collect(asset)
  if (bytes.byteLength < asset.minimumBytes) {
    throw new Error(`${asset.name}: ${bytes.byteLength} byte ricevuti, attesi almeno ${asset.minimumBytes}`)
  }
  await writeFile(target, bytes)
  report.push(`+ ${asset.name} (${(bytes.byteLength / 1_048_576).toFixed(2)} MB, sha256 ${createHash('sha256').update(bytes).digest('hex').slice(0, 16)})`)
}

console.log(report.join('\n'))
console.log(`\nRuntime OCR locale pronto in public/tesseract. I binari restano fuori da Git.`)
