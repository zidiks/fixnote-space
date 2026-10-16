import { splitAtQuiet } from '@fixnote/core/speech'
import type * as Ort from 'onnxruntime-web'
import { ctcDecode, parseVocabulary } from './ctc'
import { gigaamFeatures, MELS } from './features'

type OrtModule = typeof Ort

/** The model hears up to about 25 s at once; longer audio goes in pieces cut at pauses. */
const MAX_S = 20

export const GIGAAM_FILES = { model: 'v3_e2e_ctc.int8.onnx', vocab: 'v3_e2e_ctc_vocab.txt' }

/**
 * GigaAM v3 E2E CTC (Russian, with punctuation and capitals) on the device. CTC: one pass of the
 * encoder per piece and the likeliest letters, no generation, so it never makes up text in
 * silence and runs fast on the CPU (8-bit weights; WebGPU has no 8-bit matrix kernels).
 */
export class GigaAm {
  private constructor(
    private readonly ort: OrtModule,
    private readonly session: Ort.InferenceSession,
    private readonly vocab: { tokens: string[]; blank: number },
  ) {}

  static async load(ort: OrtModule, model: Uint8Array, vocabulary: string): Promise<GigaAm> {
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    return new GigaAm(ort, session, parseVocabulary(vocabulary))
  }

  async transcribe(audio: Float32Array): Promise<{ text: string; confidence: number }> {
    const texts: string[] = []
    let sure = 0
    let weight = 0
    for (const piece of splitAtQuiet(audio, MAX_S)) {
      const { data, frames } = gigaamFeatures(piece)
      const result = await this.session.run({
        features: new this.ort.Tensor('float32', data, [1, MELS, frames]),
        feature_lengths: new this.ort.Tensor('int64', BigInt64Array.from([BigInt(frames)]), [1]),
      })
      const logProbs = result.log_probs as Ort.Tensor
      const steps = logProbs.dims[1] ?? 0
      const { text, confidence } = ctcDecode(logProbs.data as Float32Array, steps, this.vocab)
      if (!text) continue
      texts.push(text)
      sure += confidence * text.length
      weight += text.length
    }
    return { text: texts.join(' '), confidence: weight ? sure / weight : 0 }
  }

  release() {
    void this.session.release()
  }
}
