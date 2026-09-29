import type { SharedRole } from '@fixnote/core'
import type { Awareness } from 'y-protocols/awareness'

/** How a person shows up to the others in a shared note (their awareness `user` field). */
export interface LiveUser {
  /** The account, so everyone can work out the same colours (see assignColors). */
  id: string
  name: string
  email: string
  /** Caret, selection and avatar colour: never the same as anyone else's in the note. */
  color: string
  role: SharedRole
}

/**
 * Clearly different hues, readable on light and dark backgrounds with white letters on top
 * (6-digit hex for the carets). The first ones differ the most.
 */
const COLORS = [
  '#1c7ed6', // blue
  '#e8590c', // orange
  '#2f9e44', // green
  '#ae3ec9', // purple
  '#e03131', // red
  '#0c8599', // teal
  '#d6336c', // pink
  '#6741d9', // indigo
  '#f08c00', // amber
  '#495057', // slate
]

const hash = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

/** The colour a person gets when nobody else in the note has it. */
export function colorFor(userId: string): string {
  return COLORS[hash(userId) % COLORS.length] as string
}

/**
 * Colours for the people in a note: each keeps their own (colorFor) unless someone before them
 * (by account id) has it, then takes the next free one. It depends only on who is there, so every
 * device works out the same colours.
 */
export function assignColors(ids: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<number>()
  for (const id of [...new Set(ids)].sort()) {
    let at = hash(id) % COLORS.length
    for (let tries = 0; taken.has(at) && tries < COLORS.length; tries++)
      at = (at + 1) % COLORS.length
    taken.add(at)
    out.set(id, COLORS[at] as string)
  }
  return out
}

/** One or two letters from an email: "bob.smith@…" → "BS", "ann@…" → "AN", "z@…" → "Z". */
export function initials(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._\-+]+/).filter(Boolean)
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : local.slice(0, 2)
  return (letters || '?').toUpperCase()
}

/** The other people in the room now (one entry per person, even with two devices open). */
export function othersIn(awareness: Awareness): (LiveUser & { clientId: number })[] {
  const seen = new Set<string>()
  const out: (LiveUser & { clientId: number })[] = []
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue
    const user = (state as { user?: Partial<LiveUser> }).user
    if (!user?.name) continue
    const id = user.email || user.name
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      clientId,
      id: user.id ?? id,
      name: user.name,
      email: user.email ?? '',
      color: user.color ?? colorFor(id),
      role: user.role ?? 'edit',
    })
  }
  return out
}

/** The awareness field that says the assistant is writing in the note for this person. */
export const AI_FIELD = 'ai'

/** The assistant at work in the note: for whom (one entry per person who asked). */
export interface AiAtWork {
  clientId: number
  /** The name of the person who asked. */
  askedBy: string
  self: boolean
}

/** Who has the assistant writing in the room now, this person included. */
export function aiIn(awareness: Awareness): AiAtWork[] {
  const seen = new Set<string>()
  const out: AiAtWork[] = []
  for (const [clientId, state] of awareness.getStates()) {
    const ai = (state as { ai?: { by?: string } | null }).ai
    if (!ai?.by || seen.has(ai.by)) continue
    seen.add(ai.by)
    out.push({ clientId, askedBy: ai.by, self: clientId === awareness.clientID })
  }
  return out
}
