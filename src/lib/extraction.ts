// Text extraction runs entirely on the owner device. Tesseract is pinned to the
// vendored runtime under /tesseract: its published defaults point at jsdelivr and
// tessdata.projectnaptha.com, which the Content-Security-Policy blocks, so an
// unpinned worker would fail after the file was already selected.
const OCR_BASE = '/tesseract'

export type ExtractionFailure = 'ocr_assets_missing' | 'unsupported_file_type'

function unavailable(reason: ExtractionFailure) {
  return new Error(reason)
}

async function ocrAssetsAvailable() {
  try {
    const response = await fetch(`${OCR_BASE}/worker.min.js`, { method: 'HEAD', cache: 'no-store' })
    return response.ok
  } catch { return false }
}

export async function extractTextLocally(file: File, status: (message: string) => void) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    status('Lettura PDF sul dispositivo')
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 30); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
    }
    return pages.join('\n\n').trim()
  }
  if (file.type.startsWith('image/')) {
    if (!await ocrAssetsAvailable()) throw unavailable('ocr_assets_missing')
    status('OCR sul dispositivo')
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('ita+eng', 1, {
      workerPath: `${OCR_BASE}/worker.min.js`,
      corePath: OCR_BASE,
      langPath: OCR_BASE,
      gzip: true,
    })
    try {
      const result = await worker.recognize(file)
      return result.data.text.trim()
    } finally { await worker.terminate() }
  }
  throw unavailable('unsupported_file_type')
}
