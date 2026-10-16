import { splitAtQuiet } from '@fixnote/core/speech'
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { Tensor } from '@huggingface/transformers'

/** The languages FixNote speaks; detection chooses among these unless told otherwise. */
export const DEFAULT_LANGUAGES = ['en', 'ru', 'es']
/** Whisper hears 30 s at a time; longer recordings go in pieces cut at pauses. */
const WINDOW_S = 28
/** How sure detection must be to take another language than the preferred one. */
const OVERRIDE = 0.8
/** Whisper's decoder holds 448 tokens; a prompt may take at most half (as OpenAI's does). */
const MAX_TOKENS = 448
const MAX_PROMPT = 160
/** A model stuck in a loop repeats itself; the same 6 tokens never come twice in a piece. */
const NO_REPEAT = 6

/**
 * The language among the candidates, from the decoder's scores of their language tokens. Short or
 * quiet phrases are often misheard as English (and then "translated"), so the preferred language
 * (the app's, or the one spoken last) stays unless another one is clearly more likely.
 */
export function pickLanguage(scores: Record<string, number>, prefer?: string): string | undefined {
  const codes = Object.keys(scores)
  if (!codes.length) return prefer
  const max = Math.max(...codes.map((c) => scores[c] ?? -Infinity))
  const weights = codes.map((c) => Math.exp((scores[c] ?? -Infinity) - max))
  const sum = weights.reduce((a, b) => a + b, 0)
  let best = codes[0] as string
  let p = 0
  codes.forEach((c, i) => {
    const q = (weights[i] ?? 0) / sum
    if (q > p) {
      p = q
      best = c
    }
  })
  if (prefer && prefer in scores && best !== prefer && p < OVERRIDE) return prefer
  return best
}

type WhisperModel = {
  generation_config: {
    decoder_start_token_id: number
    lang_to_id: Record<string, number>
    task_to_id: Record<string, number>
    no_timestamps_token_id: number
  }
  _prepare_encoder_decoder_kwargs_for_generation(args: object): Promise<{ encoder_outputs: Tensor }>
  (inputs: object): Promise<{ logits: Tensor }>
  generate(args: object): Promise<Tensor>
}

/**
 * The tokens the decoder starts from: the prompt after <|startofprev|> (the words it should
 * expect and what was said just before, so names and punctuation carry over), then the usual
 * start, language, task and no timestamps.
 */
function startTokens(
  asr: AutomaticSpeechRecognitionPipeline,
  model: WhisperModel,
  language: string,
  prompt: string | undefined,
): number[] {
  const config = model.generation_config
  const start = [
    config.decoder_start_token_id,
    config.lang_to_id[`<|${language}|>`] ?? config.lang_to_id['<|en|>'],
    config.task_to_id.transcribe,
    config.no_timestamps_token_id,
  ].filter((id): id is number => id !== undefined)
  const previous = asr.tokenizer.convert_tokens_to_ids('<|startofprev|>')
  const text = prompt?.trim()
  if (!text || previous === undefined || previous === null) return start
  const ids = asr.tokenizer.encode(` ${text}`, { add_special_tokens: false }) as number[]
  return [previous, ...ids.slice(-MAX_PROMPT), ...start]
}

/**
 * transformers.js does not detect the language (it quietly takes English, which turned Russian
 * speech into an English "translation"). So: encode the first 30 s once, read which language
 * token the decoder expects first, restricted to the person's languages, and transcribe in it.
 * Each piece reuses its encoding for the transcript; a long recording goes piece by piece, each
 * prompted with the text before it. A detected `skip` language stops there (another model
 * writes that language) and comes back with no text.
 */
export async function transcribe(
  asr: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array,
  fixed: string | undefined,
  candidates: string[],
  prefer?: string,
  prompt?: string,
  skip?: string,
): Promise<{ text: string; language: string }> {
  const model = asr.model as unknown as WhisperModel
  const config = model.generation_config
  let language = fixed
  const texts: string[] = []
  for (const piece of splitAtQuiet(audio, WINDOW_S)) {
    const { input_features } = (await asr.processor(piece)) as { input_features: Tensor }
    const { encoder_outputs } = await model._prepare_encoder_decoder_kwargs_for_generation({
      inputs_tensor: input_features,
      model_inputs: { input_features },
      model_input_name: 'input_features',
      generation_config: config,
    })
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
      const scores: Record<string, number> = {}
      for (const code of candidates.length ? candidates : DEFAULT_LANGUAGES) {
        const id = config.lang_to_id[`<|${code}|>`]
        if (id !== undefined && row[id] !== undefined) scores[code] = row[id]
      }
      language = pickLanguage(scores, prefer) ?? 'en'
      if (language === skip) return { text: '', language }
    }
    const before = [prompt, ...texts].filter(Boolean).join(' ')
    const init = startTokens(asr, model, language, before)
    const ids = await model.generate({
      inputs: input_features,
      encoder_outputs,
      decoder_input_ids: [init],
      max_new_tokens: Math.min(440, MAX_TOKENS - init.length),
      no_repeat_ngram_size: NO_REPEAT,
    })
    const generated = (ids.tolist() as bigint[][]).map((row) => row.slice(init.length).map(Number))
    const [text] = asr.tokenizer.batch_decode(generated, { skip_special_tokens: true })
    if (text?.trim()) texts.push(text.trim())
  }
  return { text: texts.join(' '), language: language ?? prefer ?? 'en' }
}
