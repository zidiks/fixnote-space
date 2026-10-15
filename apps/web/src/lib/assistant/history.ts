import type { PastTurn } from '@fixnote/ai'
import type { ChatEntry } from '@fixnote/core'

/**
 * The thread as turns the model sees again: each question with its answer and how it got there
 * (tool steps, reasoning), what it cited and changed. Failed answers are left out.
 */
export function pastTurns(entries: readonly ChatEntry[]): PastTurn[] {
  const out: PastTurn[] = []
  for (const [i, q] of entries.entries()) {
    if (q.kind !== 'user') continue
    const a = entries.slice(i + 1).find((m) => m.kind !== 'divider')
    if (a?.kind !== 'assistant') continue
    if (a.status !== 'done' && a.status !== 'stopped') continue
    if (!a.content && !a.actions?.items.length && !a.trace?.steps.length) continue
    out.push({
      at: q.createdAt,
      question: q.content,
      answer: a.content,
      trace: a.trace ?? null,
      citations: a.citations,
      changes: a.actions?.items.length
        ? { labels: a.actions.items.map((x) => x.label), undone: a.actions.undone }
        : null,
      stopped: a.status === 'stopped',
    })
  }
  return out
}
