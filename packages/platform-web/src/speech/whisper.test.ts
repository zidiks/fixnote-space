import { readFileSync } from 'node:fs'
import { type AutomaticSpeechRecognitionPipeline, env, pipeline } from '@huggingface/transformers'
import { describe, expect, it, vi } from 'vitest'
import { pickLanguage, transcribe } from './whisper'

/**
 * Downloads Whisper (~80 MB), so it runs only when asked: ASR_TEST=<folder with ru.json, es.json,
 * en.json holding { audio: number[] } at 16 kHz>.
 */
const dir = process.env.ASR_TEST

describe('pickLanguage', () => {
  it('keeps the preferred language unless another one is clearly more likely', () => {
    // Russian speech heard as a little more English than Russian.
    expect(pickLanguage({ en: 2, ru: 1.5, es: -3 }, 'ru')).toBe('ru')
    // Clear English stays English for a Russian speaker.
    expect(pickLanguage({ en: 6, ru: 1, es: 0 }, 'ru')).toBe('en')
    expect(pickLanguage({ en: 2, ru: 1.5 })).toBe('en')
    expect(pickLanguage({ en: 1, ru: 2 }, 'de')).toBe('ru')
    expect(pickLanguage({}, 'ru')).toBe('ru')
  })
})

describe('tensor disposal in transcribe', () => {
  it('disposes encoder_outputs, input_features, logits, present.* KV tensors, and generated ids', async () => {
    const encoderDispose = vi.fn()
    const featuresDispose = vi.fn()
    const logitsDispose = vi.fn()
    const kvKeyDispose = vi.fn()
    const kvValDispose = vi.fn()
    const idsDispose = vi.fn()

    const encoderOutputs = { dispose: encoderDispose }
    const inputFeatures = { dispose: featuresDispose }
    const logitsData = new Float32Array([0, 5, 1])
    const forwardFn = vi.fn(async () => ({
      logits: { dims: [1, 1, 3], data: logitsData, dispose: logitsDispose },
      'present.0.decoder.key': { dispose: kvKeyDispose },
      'present.0.decoder.value': { dispose: kvValDispose },
    }))
    const model = Object.assign(forwardFn, {
      generation_config: {
        decoder_start_token_id: 50258,
        lang_to_id: { '<|en|>': 1, '<|ru|>': 2 },
        task_to_id: { transcribe: 50359 },
        no_timestamps_token_id: 50363,
      },
      _prepare_encoder_decoder_kwargs_for_generation: vi.fn(async () => ({
        encoder_outputs: encoderOutputs,
      })),
      generate: vi.fn(async () => ({
        tolist: () => [[50258n, 1n, 50359n, 50363n, 100n]],
        dispose: idsDispose,
      })),
    })
    const fakeAsr = {
      model,
      processor: vi.fn(async () => ({ input_features: inputFeatures })),
      tokenizer: {
        convert_tokens_to_ids: () => undefined,
        encode: () => [],
        batch_decode: () => ['hello'],
      },
    } as unknown as AutomaticSpeechRecognitionPipeline

    const res = await transcribe(fakeAsr, new Float32Array(16_000), undefined, ['en', 'ru'])
    expect(res).toEqual({ text: 'hello', language: 'en' })
    expect(logitsDispose).toHaveBeenCalledTimes(1)
    expect(kvKeyDispose).toHaveBeenCalledTimes(1)
    expect(kvValDispose).toHaveBeenCalledTimes(1)
    expect(idsDispose).toHaveBeenCalledTimes(1)
    expect(encoderDispose).toHaveBeenCalledTimes(1)
    expect(featuresDispose).toHaveBeenCalledTimes(1)
  })
})

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
