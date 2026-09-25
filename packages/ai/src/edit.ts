import type { ChatMessage } from './client'

/** Quick actions in the selection popover; `custom` carries the user's own instruction. */
export type EditAction = 'rewrite' | 'shorten' | 'reformat' | 'fix' | 'structure' | 'custom'

export interface EditInput {
  action: EditAction
  /** The Markdown to change: a selection, or the whole note for `structure`. */
  text: string
  /** Required for `custom`: what the user asked for, in their words. */
  instruction?: string
  /** Title of the note, for tone and terms. */
  noteTitle?: string
  /** A little of the surrounding text, so the edit fits in. Never changed. */
  before?: string
  after?: string
}

/** Marker the dev backend uses to recognize an edit request; keep it in the prompt. */
export const EDIT_MARKER = 'You edit a fragment of a note'

const SYSTEM = `${EDIT_MARKER} in FixNote, a private notes app.

Rules:
- Reply with the replacement Markdown only: no preface, no explanations, no code fences around it.
- Keep the language of the text (do not translate unless asked). Keep the author's voice.
- Keep facts, names, numbers, links and #tags. Do not add information that is not in the text.
- Markdown allowed: **bold**, *italic*, ~~strike~~, \`code\`, links, lists, "- [ ]" checklists,
  "#", "##", "###" headings, "> " quotes, code blocks. Nothing else (no tables, no HTML).
- The surrounding text is context only; never repeat or change it.`

const TASKS: Record<Exclude<EditAction, 'custom'>, string> = {
  rewrite: 'Rewrite the fragment so it reads clearly and naturally. Same meaning, similar length.',
  shorten: 'Make the fragment shorter: keep every point that matters, drop filler and repetition.',
  reformat:
    'Reformat the fragment for easy scanning: split into short paragraphs, lists or a checklist where it fits. Do not change the wording more than needed.',
  fix: 'Fix spelling, grammar and punctuation only. Change nothing else.',
  structure:
    'This is a raw dump (dictated or pasted). Turn it into a tidy note: a short "# " title on the first line, then the content as short paragraphs, lists and checklists for anything that sounds like a task. Keep every thought; remove filler words like "um" or "ну вот".',
}

export function buildEditMessages(input: EditInput): ChatMessage[] {
  const task =
    input.action === 'custom'
      ? `Do what the user asks with the fragment: ${input.instruction?.trim() || 'improve it'}`
      : TASKS[input.action]
  const context = [
    input.noteTitle ? `Note title: ${input.noteTitle}` : '',
    input.before?.trim() ? `Text before (context):\n${input.before.trim().slice(-600)}` : '',
    input.after?.trim() ? `Text after (context):\n${input.after.trim().slice(0, 600)}` : '',
  ].filter(Boolean)
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        `Task: ${task}`,
        ...context,
        `Fragment:\n<<<\n${input.text}\n>>>`,
        'Replacement:',
      ].join('\n\n'),
    },
  ]
}

/** Strips what models add despite the rules: a wrapping code fence, the <<< >>> markers. */
export function cleanEditOutput(reply: string): string {
  let text = reply.trim()
  const fence = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/)
  if (fence?.[1] !== undefined) text = fence[1]
  text = text.replace(/^<<<\s*\n?/, '').replace(/\n?>>>\s*$/, '')
  return text.trim()
}
