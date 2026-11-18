/** Splits demo copy on [brackets]: the bracketed words are drawn as search matches. */
export function marks(text: string): { text: string; mark: boolean }[] {
  return text
    .split(/(\[[^\]]+\])/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('[') && part.endsWith(']')
        ? { text: part.slice(1, -1), mark: true }
        : { text: part, mark: false },
    )
}

/** The copy without brackets (for anything that is not drawn). */
export const plain = (text: string) => text.replace(/[[\]]/g, '')
