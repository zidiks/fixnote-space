import { readFileSync } from 'node:fs'
import { type AutomaticSpeechRecognitionPipeline, env, pipeline } from '@huggingface/transformers'
import { describe, expect, it } from 'vitest'
import { transcribe } from './transcribe'

/**
 * Downloads Whisper (~80 MB), so it runs only when asked: ASR_TEST=<folder with ru.json, es.json,
 * en.json holding { audio: number[] } at 16 kHz>.
 */
const dir = process.env.ASR_TEST

describe.skipIf(!dir)('transcribe', () => {
  it('detects the language among the person’s languages and transcribes in it', async () => {
    env.cacheDir = `${dir}/cache`
    const asr = (await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
      dtype: 'q8',
      device: 'cpu',
    })) as AutomaticSpeechRecognitionPipeline
    const clip = (lang: string) =>
      Float32Array.from(JSON.parse(readFileSync(`${dir}/${lang}.json`, 'utf8')).audio as number[])
    const ru = await transcribe(asr, clip('ru'), undefined, ['en', 'ru', 'es'])
    expect(ru.language).toBe('ru')
    expect(ru.text).toMatch(/[а-я]/i)
    expect(ru.text.toLowerCase()).toContain('молок')
    const es = await transcribe(asr, clip('es'), undefined, ['en', 'ru', 'es'])
    expect(es.language).toBe('es')
    expect(es.text.toLowerCase()).toContain('leche')
    const en = await transcribe(asr, clip('en'), undefined, ['en', 'ru', 'es'])
    expect(en.language).toBe('en')
    expect(en.text.toLowerCase()).toContain('country')
    // A language asked for is used as is.
    expect((await transcribe(asr, clip('ru'), 'ru', [])).language).toBe('ru')
  }, 300_000)
})
