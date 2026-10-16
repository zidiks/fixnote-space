import { readFileSync } from 'node:fs'
import * as ort from 'onnxruntime-web'
import { describe, expect, it } from 'vitest'
import { ctcDecode, parseVocabulary } from './ctc'
import { frameCount, gigaamFeatures, MELS } from './features'
import { GigaAm } from './gigaam'
import { SileroVad, speechSpans, trimToSpeech } from './vad'

/**
 * Needs the models (~230 MB), so it runs only when asked: GIGAAM_TEST=<folder with
 * v3_e2e_ctc.int8.onnx, v3_e2e_ctc_vocab.txt, silero.onnx (onnx-community/silero-vad), ru.json
 * { audio, features (64 × 50 reference frames from onnx-asr), frames } and en.json { audio }>.
 */
const dir = process.env.GIGAAM_TEST

describe('ctcDecode', () => {
  it('merges repeats, drops blanks and joins pieces into words', () => {
    const vocab = parseVocabulary('<unk> 0\n▁ 1\n, 2\nпр 3\nи 4\n▁в 5\nет 6\n<blk> 7')
    expect(vocab.blank).toBe(7)
    const frame = (id: number) => Array.from({ length: 8 }, (_, v) => (v === id ? 0 : -20))
    const ids = [3, 3, 7, 4, 5, 7, 5, 6, 2, 7, 1, 1, 3]
    const logProbs = Float32Array.from(ids.flatMap(frame))
    const { text, confidence } = ctcDecode(logProbs, ids.length, vocab)
    expect(text).toBe('при в вет, пр')
    expect(confidence).toBeCloseTo(1)
  })
})

describe('gigaamFeatures', () => {
  it('makes 10 ms frames of 64 bands', () => {
    expect(frameCount(320)).toBe(1)
    expect(frameCount(16_000)).toBe(99)
    const { data, frames } = gigaamFeatures(new Float32Array(16_000))
    expect(frames).toBe(99)
    expect(data.length).toBe(MELS * 99)
    // Silence is the clamp's floor.
    expect(data[0]).toBeCloseTo(Math.log(1e-9))
  })
})

describe.skipIf(!dir)('GigaAM', () => {
  const read = (name: string) => readFileSync(`${dir}/${name}`)
  const clip = (lang: string) => JSON.parse(read(`${lang}.json`).toString('utf8'))

  it('matches the reference features and transcribes Russian', async () => {
    const ru = clip('ru')
    const audio = Float32Array.from(ru.audio as number[])
    const { data, frames } = gigaamFeatures(audio)
    expect(frames).toBe(ru.frames)
    let diff = 0
    const reference = ru.features as number[][]
    for (const [m, band] of reference.entries()) {
      for (const [t, v] of band.entries()) {
        diff = Math.max(diff, Math.abs((data[m * frames + t] as number) - v))
      }
    }
    expect(diff).toBeLessThan(1e-3)

    const model = await GigaAm.load(
      ort,
      read('v3_e2e_ctc.int8.onnx'),
      read('v3_e2e_ctc_vocab.txt').toString('utf8'),
    )
    const started = performance.now()
    const result = await model.transcribe(audio)
    const ms = performance.now() - started
    console.log('ru', result, `${Math.round(ms)} ms for ${audio.length / 16_000} s`)
    expect(result.text).toContain('У лукоморья дуб зелёный')
    expect(result.confidence).toBeGreaterThan(0.85)

    const en = await model.transcribe(Float32Array.from(clip('en').audio as number[]))
    console.log('en', en)
    expect(en.confidence).toBeLessThan(result.confidence)
  }, 300_000)

  it('finds the speech and drops silence', async () => {
    const vad = await SileroVad.load(ort, read('silero.onnx'))
    const speech = Float32Array.from(clip('ru').audio as number[])
    const audio = new Float32Array(speech.length + 3 * 16_000)
    audio.set(speech, 16_000)
    const spans = await vad.spans(audio)
    console.log('spans', spans)
    expect(spans.length).toBeGreaterThan(0)
    expect(spans[0]?.start).toBeGreaterThanOrEqual(15_000)
    expect(spans.at(-1)?.end).toBeLessThanOrEqual(16_000 + speech.length + 8_000)
    expect(trimToSpeech(audio, spans)?.length).toBeLessThan(audio.length)
    expect(await vad.spans(new Float32Array(3 * 16_000))).toEqual([])
    const noise = Float32Array.from({ length: 3 * 16_000 }, () => (Math.random() - 0.5) * 0.02)
    expect(await vad.spans(noise)).toEqual([])
    expect(speechSpans([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.1])).toEqual([
      { start: 0, end: 8 * 512 },
    ])
  }, 300_000)
})
