import { formatRecurrence, parseRecurrence, RECUR_MARK, type Recurrence } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { Extension } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/react'

/** The rule at the end of a task line: ` 🔁 weekly:mon`. */
const MARK = new RegExp(`\\s*${RECUR_MARK}\\s*(\\S+)$`)

/** Mon…Sun of some week, for weekday names. */
const WEEK = [
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
]
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const weekdayCache = new Map<string, { key: (typeof WEEKDAYS)[number]; name: string }[]>()

/** Short weekday names in the UI language, Monday first, with the rule's keys. */
export function weekdayNames(lang = i18n.resolvedLanguage) {
  const key = lang ?? ''
  const cached = weekdayCache.get(key)
  if (cached) return cached
  const format = new Intl.DateTimeFormat(lang, { weekday: 'short' })
  const built = WEEKDAYS.map((day, i) => ({
    key: day,
    name: format.format(new Date(`${WEEK[i]}T12:00:00`)),
  }))
  weekdayCache.set(key, built)
  return built
}

/** "по пн, чт", "every 3 days"… */
export function repeatLabel(rule: Recurrence): string {
  switch (rule.kind) {
    case 'daily':
      return i18n.t('repeat.chipDaily')
    case 'weekdays':
      return i18n.t('repeat.chipWeekdays')
    case 'weekly': {
      const names = weekdayNames()
      const days = names.filter((d) => rule.days.includes(d.key)).map((d) => d.name)
      return i18n.t('repeat.chipWeekly', { days: days.join(', ') })
    }
    case 'monthly':
      return i18n.t('repeat.chipMonthly', { day: rule.day })
    case 'interval':
      return i18n.t('repeat.chipInterval', { n: rule.every })
  }
}

/** The rule written at the end of a task's first paragraph, with where it starts. */
function markIn(paragraph: PmNode, start: number) {
  const text = paragraph.textContent
  const m = text.match(MARK)
  if (!m || m.index === undefined) return null
  const end = start + paragraph.content.size
  return { from: end - (text.length - m.index), to: end, rule: parseRecurrence(m[1] as string) }
}

export interface TaskTarget {
  /** Position of the task item. */
  pos: number
  /** Its place among the note's tasks, as they appear in the Markdown. */
  index: number
}

/** The task item under a screen point, if any. */
export function taskAt(editor: Editor, x: number, y: number): TaskTarget | null {
  const hit = editor.view.posAtCoords({ left: x, top: y })
  if (!hit) return null
  const $pos = editor.state.doc.resolve(hit.inside >= 0 ? hit.inside : hit.pos)
  // posAtCoords may point at the item itself (the checkbox) rather than inside its text.
  const at = editor.state.doc.nodeAt(hit.inside >= 0 ? hit.inside : hit.pos)
  let pos: number | null = at?.type.name === 'taskItem' ? hit.inside : null
  for (let d = $pos.depth; pos === null && d > 0; d--) {
    if ($pos.node(d).type.name === 'taskItem') pos = $pos.before(d)
  }
  if (pos === null) return null
  let index = 0
  editor.state.doc.descendants((node, p) => {
    if (p >= (pos as number)) return false
    if (node.type.name === 'taskItem') index++
    return true
  })
  return { pos, index }
}

/** The rule of the task item at `pos`, or null. */
export function repeatOf(editor: Editor, pos: number): Recurrence | null {
  const item = editor.state.doc.nodeAt(pos)
  const first = item?.firstChild
  if (!first?.isTextblock) return null
  return markIn(first, pos + 2)?.rule ?? null
}

/** Sets (or with null removes) the rule at the end of the task item at `pos`, as one undo step. */
export function setRepeat(editor: Editor, pos: number, rule: Recurrence | null): void {
  const item = editor.state.doc.nodeAt(pos)
  const first = item?.firstChild
  if (!first?.isTextblock) return
  const start = pos + 2
  const mark = markIn(first, start)
  const from = mark?.from ?? start + first.content.size
  const to = mark?.to ?? from
  const text = rule ? ` ${RECUR_MARK} ${formatRecurrence(rule)}` : ''
  const tr = editor.state.tr
  if (text) tr.insertText(text, from, to)
  else tr.delete(from, to)
  editor.view.dispatch(tr)
}

interface RecurringState {
  decorations: DecorationSet
  hasRecurring: boolean
  editingPos: number | null
}

/** Position of the recurring taskItem whose first line holds `$head`, or null. */
function editingRecurringPos(doc: PmNode, headPos: number): number | null {
  const $head = doc.resolve(headPos)
  for (let d = $head.depth; d >= 1; d--) {
    const node = $head.node(d)
    if (node.type.name !== 'taskItem') continue
    const pos = $head.before(d)
    const first = node.firstChild
    if (!first?.isTextblock) return null
    if (headPos < pos + 2 || headPos > pos + 2 + first.content.size) return null
    return markIn(first, pos + 2)?.rule ? pos : null
  }
  return null
}

function buildRecurringState(doc: PmNode, headPos: number): RecurringState {
  const decorations: Decoration[] = []
  let hasRecurring = false
  let editingPos: number | null = null
  doc.descendants((node, pos) => {
    if (node.type.name !== 'taskItem') return true
    const first = node.firstChild
    if (!first?.isTextblock) return true
    const mark = markIn(first, pos + 2)
    if (!mark?.rule) return true
    hasRecurring = true
    const editing = headPos >= pos + 2 && headPos <= pos + 2 + first.content.size
    if (editing) {
      editingPos = pos
      decorations.push(Decoration.inline(mark.from, mark.to, { class: 'fixnote-repeat-raw' }))
      return true
    }
    decorations.push(Decoration.inline(mark.from, mark.to, { class: 'fixnote-repeat-hidden' }))
    const label = `${RECUR_MARK} ${repeatLabel(mark.rule)}`
    decorations.push(
      Decoration.widget(
        mark.to,
        () => {
          const chip = document.createElement('span')
          chip.className = 'fixnote-repeat-chip'
          chip.contentEditable = 'false'
          chip.textContent = label
          return chip
        },
        { side: 1, key: `repeat-${label}`, ignoreSelection: true },
      ),
    )
    return true
  })
  return {
    decorations: decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty,
    hasRecurring,
    editingPos,
  }
}

const key = new PluginKey<RecurringState>('recurringTasks')

/**
 * Shows a task's rule as a small "🔁 every Mon" label; with the caret in that line the raw text
 * is shown instead, so it can be edited like any other text.
 */
export const RecurringTasks = Extension.create({
  name: 'recurringTasks',
  addProseMirrorPlugins() {
    return [
      new Plugin<RecurringState>({
        key,
        state: {
          init: (_config, state) => buildRecurringState(state.doc, state.selection.$head.pos),
          apply: (tr, prev, _oldState, newState) => {
            if (tr.docChanged) {
              return buildRecurringState(newState.doc, newState.selection.$head.pos)
            }
            if (!prev.hasRecurring || !tr.selectionSet) return prev
            const nextEditing = editingRecurringPos(newState.doc, newState.selection.$head.pos)
            if (nextEditing === prev.editingPos) return prev
            return buildRecurringState(newState.doc, newState.selection.$head.pos)
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ]
  },
})
