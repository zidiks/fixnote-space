import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { Tensor } from '@huggingface/transformers'

/** The languages FixNote speaks; detection chooses among these unless told otherwise. */
export const DEFAULT_LANGUAGES = ['en', 'ru', 'es']
const SAMPLE_RATE = 16_000
/** Whisper hears 30 s at a time; longer recordings are transcribed in chunks. */
const WINDOW_S = 30

/**
 * transformers.js does not detect the language (it quietly takes English, which turned Russian
 * speech into an English "translation"). So: encode the first 30 s once, read which language
 * token the decoder expects first, restricted to the person's languages, and transcribe in it.
 * Short recordings reuse that encoding for the transcript too.
 */
export async function transcribe(
  asr: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array,
  fixed: string | undefined,
  candidates: string[],
): Promise<{ text: string; language: string }> {
  const model = asr.model as unknown as {
    generation_config: {
      decoder_start_token_id: number
      lang_to_id: Record<string, number>
    }
    _prepare_encoder_decoder_kwargs_for_generation(
      args: object,
    ): Promise<{ encoder_outputs: Tensor }>
    (inputs: object): Promise<{ logits: Tensor }>
    generate(args: object): Promise<Tensor>
  }
  const config = model.generation_config
  const head = audio.subarray(0, SAMPLE_RATE * WINDOW_S)
  const { input_features } = (await asr.processor(head)) as { input_features: Tensor }
  const { encoder_outputs } = await model._prepare_encoder_decoder_kwargs_for_generation({
    inputs_tensor: input_features,
    model_inputs: { input_features },
    model_input_name: 'input_features',
    generation_config: config,
  })
  let language = fixed
  if (!language) {
    const start = new Tensor(
      'int64',
      BigInt64Array.from([BigInt(config.decoder_start_token_id)]),
      [1, 1],
    )
    const { logits } = await model({ input_features, encoder_outputs, decoder_input_ids: start })
    const vocab = logits.dims.at(-1) ?? 0
    const data = logits.data as Float32Array
    const row = data.subarray(data.length - vocab)
    let best = -Infinity
    for (const code of candidates.length ? candidates : DEFAULT_LANGUAGES) {
      const id = config.lang_to_id[`<|${code}|>`]
      if (id === undefined) continue
      const score = row[id] ?? -Infinity
      if (score > best) {
        best = score
        language = code
      }
    }
    language ??= 'en'
  }
  if (audio.length > head.length) {
    const output = await asr(audio, {
      task: 'transcribe',
      language,
      chunk_length_s: WINDOW_S,
      stride_length_s: 5,
    })
    const text = Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text
    return { text: text.trim(), language }
  }
  const ids = await model.generate({
    inputs: input_features,
    encoder_outputs,
    language,
    task: 'transcribe',
    max_new_tokens: 440,
  })
  const [text] = asr.tokenizer.batch_decode(ids, { skip_special_tokens: true })
  return { text: (text ?? '').trim(), language }
}
