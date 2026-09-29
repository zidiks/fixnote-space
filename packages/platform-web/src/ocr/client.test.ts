import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorker, OEM, PSM } from 'tesseract.js'
import { describe, expect, it } from 'vitest'
import { clean } from './client'

describe('clean', () => {
  it('keeps lines with words and drops the noise read from textures', () => {
    expect(clean('  Кафе «Лето»  \n|| ~ .\n\nИтого   570\n—\n')).toBe('Кафе «Лето»\nИтого 570')
    expect(clean('. , ;')).toBe('')
  })
})

// Real recognition with the language data the app downloads. Needs the files in a folder:
// OCR_TEST=<dir with eng/rus/spa.traineddata.gz and receipt.png> pnpm vitest run src/ocr
describe.skipIf(!process.env.OCR_TEST)('Tesseract with the app settings', () => {
  it('reads Russian, English and Spanish in one pass', { timeout: 120_000 }, async () => {
    const dir = process.env.OCR_TEST as string
    // As in the app: the data sits in tesseract.js's cache (in Node, files) and is only read.
    const cache = mkdtempSync(join(tmpdir(), 'fixnote-ocr-'))
    for (const code of ['eng', 'rus', 'spa'])
      copyFileSync(join(dir, `${code}.traineddata.gz`), join(cache, `${code}.traineddata`))
    const worker = await createWorker(['eng', 'rus', 'spa'], OEM.LSTM_ONLY, {
      cacheMethod: 'readOnly',
      cachePath: cache,
      langPath: 'https://offline.invalid',
      legacyCore: false,
      legacyLang: false,
    })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const { data } = await worker.recognize(readFileSync(join(dir, 'receipt.png')))
    await worker.terminate()
    const text = clean(data.text)
    expect(text).toContain('Капучино 250')
    expect(text).toContain('Cheesecake 320')
    expect(text).toMatch(/Mañana/)
    expect(text).toContain('Итого 570')
  })
})
