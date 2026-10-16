/** GigaAM's vocabulary file: one "token id" per line; "▁" starts a word, "<blk>" is CTC's blank. */
export function parseVocabulary(text: string): { tokens: string[]; blank: number } {
  const tokens: string[] = []
  let blank = -1
  for (const line of text.split('\n')) {
    const at = line.lastIndexOf(' ')
    if (at <= 0) continue
    const id = Number(line.slice(at + 1))
    const token = line.slice(0, at)
    if (!Number.isInteger(id)) continue
    tokens[id] = token
    if (token === '<blk>') blank = id
  }
  return { tokens, blank: blank >= 0 ? blank : tokens.length - 1 }
}

/**
 * Greedy CTC: the likeliest token of each frame, repeats merged, blanks dropped. `confidence` is
 * the mean probability of the tokens kept, low when the speech is not Russian (the model then
 * spells another language with Russian sounds) or not speech at all.
 */
export function ctcDecode(
  logProbs: Float32Array,
  frames: number,
  vocab: { tokens: string[]; blank: number },
): { text: string; confidence: number } {
  const size = logProbs.length / frames
  const out: string[] = []
  let previous = -1
  let sure = 0
  let kept = 0
  for (let t = 0; t < frames; t++) {
    let best = 0
    let max = -Infinity
    for (let v = 0; v < size; v++) {
      const p = logProbs[t * size + v] as number
      if (p > max) {
        max = p
        best = v
      }
    }
    if (best !== vocab.blank && best !== previous) {
      const token = vocab.tokens[best]
      if (token && token !== '<unk>') {
        out.push(token)
        sure += Math.exp(max)
        kept++
      }
    }
    previous = best
  }
  const text = out
    .join('')
    .replaceAll('▁', ' ')
    .replace(/\s+([,.!?…:;»)])/gu, '$1')
    .replace(/([«(])\s+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return { text, confidence: kept ? sure / kept : 0 }
}
