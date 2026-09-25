export type Tone = 'brand' | 'blue' | 'green'

/**
 * A headline is a list of plain phrases, highlighted chips and "\n" line breaks. A chip's `after`
 * text (punctuation) hugs the chip outside its tint.
 */
export type Part = string | { text: string; tone: Tone; after?: string }
