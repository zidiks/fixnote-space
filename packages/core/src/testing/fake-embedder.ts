import type { Embedder } from '../platform'

/**
 * Deterministic stand-in for a multilingual model: words from the same group land on the same
 * dimension, so "стили" and "CSS" are close while sharing no letters.
 */
const GROUPS = [
  ['css', 'стили', 'styles', 'оформление', 'oklch', 'цвет', 'color', 'colores'],
  ['cooking', 'recipe', 'рецепт', 'готовить', 'receta', 'борщ', 'soup'],
  ['travel', 'trip', 'поездка', 'viaje', 'самолёт', 'flight', 'отель'],
  ['money', 'budget', 'бюджет', 'деньги', 'dinero', 'расходы'],
]

export class FakeEmbedder implements Embedder {
  readonly dimensions = GROUPS.length + 1
  calls = 0
  fail = false
  constructor(readonly modelId = 'fake-v1') {}
  async ready() {}
  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    this.calls++
    if (this.fail) throw new Error('model unavailable')
    return texts.map((t) => {
      const v = new Float32Array(this.dimensions)
      const words = t.toLowerCase().split(/[^\p{L}\p{N}]+/u)
      for (const w of words) {
        const g = GROUPS.findIndex((group) => group.some((x) => w.startsWith(x)))
        const dim = g >= 0 ? g : GROUPS.length
        v[dim] = (v[dim] ?? 0) + (g >= 0 ? 1 : 0.05)
      }
      return v
    })
  }
}
