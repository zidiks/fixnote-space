/** Which notes the assistant looks at. Shown as a badge above the chat input. */
export type ChatScope =
  | { kind: 'all' }
  | { kind: 'folder'; id: string; name: string }
  | { kind: 'note'; id: string; title: string }

export const sameScope = (a: ChatScope, b: ChatScope) =>
  a.kind === b.kind && (a.kind === 'all' || a.id === (b as { id: string }).id)
