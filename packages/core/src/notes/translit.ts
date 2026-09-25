/**
 * Rough Cyrillic ⇄ Latin transliteration for search, so "телеграм" finds "Telegram" and
 * "notion" finds "ноушн"-style spellings often enough. It only adds candidates; exact matches
 * always count too.
 */
const RU_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

// Longest first so digraphs win.
const LAT_TO_RU_PAIRS: [string, string][] = [
  ['sch', 'щ'],
  ['shch', 'щ'],
  ['zh', 'ж'],
  ['ch', 'ч'],
  ['sh', 'ш'],
  ['ts', 'ц'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['yo', 'ё'],
  ['ee', 'и'],
  ['oo', 'у'],
  ['ph', 'ф'],
  ['th', 'т'],
  ['ck', 'к'],
  ['qu', 'кв'],
  ['x', 'кс'],
  ['w', 'в'],
  ['q', 'к'],
  ['c', 'к'],
  ['j', 'дж'],
  ['y', 'й'],
  ['a', 'а'],
  ['b', 'б'],
  ['v', 'в'],
  ['g', 'г'],
  ['d', 'д'],
  ['e', 'е'],
  ['z', 'з'],
  ['i', 'и'],
  ['k', 'к'],
  ['l', 'л'],
  ['m', 'м'],
  ['n', 'н'],
  ['o', 'о'],
  ['p', 'п'],
  ['r', 'р'],
  ['s', 'с'],
  ['t', 'т'],
  ['u', 'у'],
  ['f', 'ф'],
  ['h', 'х'],
]
const LAT_TO_RU = [...LAT_TO_RU_PAIRS].sort((a, b) => b[0].length - a[0].length)

const isCyrillic = (w: string) => /[Ѐ-ӿ]/.test(w)
const isLatin = (w: string) => /^[a-z]+$/.test(w)

/** The word in the other script, or null when there is nothing to transliterate. */
export function transliterate(word: string): string | null {
  const w = word.toLowerCase()
  if (isCyrillic(w)) {
    const out = [...w].map((ch) => RU_TO_LAT[ch] ?? ch).join('')
    return out !== w && isLatin(out) ? out : null
  }
  if (isLatin(w)) {
    let out = ''
    for (let i = 0; i < w.length; ) {
      const hit = LAT_TO_RU.find(([lat]) => w.startsWith(lat, i))
      if (!hit) return null
      out += hit[1]
      i += hit[0].length
    }
    return out
  }
  return null
}
