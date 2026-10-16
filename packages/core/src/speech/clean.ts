/**
 * What speech models write when nobody speaks: Whisper learned from subtitles, so silence, music
 * or a cough come out as the credits of a video. A sentence that is only one of these is dropped.
 */
const JUNK: RegExp[] = [
  // Russian
  /^(редактор|корректор|автор) субтитров(\s.*)?$/iu,
  /^субтитры (сделал|сделала|делал|делала|создавал|создавала|подготовил|подготовила|подогнал)(\s.*)?$/iu,
  /^субтитры\s.*(dimatorzok|amara\.org).*$/iu,
  /^продолжение следует$/iu,
  /^спасибо за (просмотр|внимание)$/iu,
  /^(подписывайтесь|подпишитесь) на (наш |мой )?канал(\s.*)?$/iu,
  /^ставьте лайки?(\s.*)?$/iu,
  /^до (новых )?встреч (на канале|в следующем видео)$/iu,
  // English
  /^thanks? (you )?(so much )?for watching$/i,
  /^(please )?(like and )?subscribe( to (my|our|the) channel)?$/i,
  /^subtitles by\b.*$/i,
  /^.*\bamara\.org\b.*$/i,
  // Spanish
  /^subtítulos (realizados |hechos )?por\s.*$/iu,
  /^(muchas )?gracias por ver( el video)?$/iu,
  /^suscríbete( al canal)?$/iu,
]

/** Sounds written as a tag: "[музыка]", "(applause)", "♪". */
const SOUND_TAG =
  /[[(（*]\s*(музыка|музыкальная заставка|аплодисменты|смех|шум|тишина|music|applause|laughter|laughs|noise|silence|música|aplausos|risas)\s*[\])）*]|[♪♫]+/giu

/** Where a sentence ends: after its punctuation, before the next one starts. */
const SENTENCE = /\S.*?(?:[.!?…]+(?=\s|$)|$)/gsu

const isJunk = (sentence: string) => {
  const bare = sentence
    .trim()
    .replace(/[.!?…,;:"«»]+$/u, '')
    .replace(/^[-–—"«\s]+/u, '')
    .trim()
  return bare.length > 0 && JUNK.some((re) => re.test(bare))
}

/**
 * The same words said over and over in a row ("и и и и", a sentence four times) are a model stuck
 * in a loop, not speech: one copy stays. A word may come three times ("да, да, да"); a phrase of
 * several words twice.
 */
export function collapseRepeats(text: string): string {
  const words = text.split(/\s+/).filter(Boolean)
  const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const out: string[] = []
  let i = 0
  while (i < words.length) {
    let skipped = false
    for (let n = 1; n <= 12 && i + 2 * n <= words.length; n++) {
      const phrase = words.slice(i, i + n).map(key)
      if (!phrase.join('')) continue
      let times = 1
      while (
        i + (times + 1) * n <= words.length &&
        words
          .slice(i + times * n, i + (times + 1) * n)
          .map(key)
          .every((w, j) => w === phrase[j])
      )
        times++
      if (times > (n === 1 ? 3 : 2)) {
        out.push(...words.slice(i, i + n))
        i += times * n
        skipped = true
        break
      }
    }
    if (!skipped) {
      out.push(words[i] as string)
      i++
    }
  }
  return out.join(' ')
}

/**
 * A transcript without what the model made up: sound tags, subtitle credits and other phrases
 * Whisper writes over silence, and loops. Real speech passes unchanged.
 */
export function cleanTranscript(text: string): string {
  const noTags = text.replace(SOUND_TAG, ' ')
  const kept = (noTags.match(SENTENCE) ?? []).filter((s) => !isJunk(s))
  return collapseRepeats(kept.join(' '))
    .replace(/\s+([,.!?…:;])/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
