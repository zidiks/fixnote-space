import type { SharedRole } from '@fixnote/core'
import type { Awareness } from 'y-protocols/awareness'

/** How a person shows up to the others in a shared note (their awareness `user` field). */
export interface LiveUser {
  name: string
  email: string
  /** Caret, selection and avatar colour: the same for this person everywhere. */
  color: string
  role: SharedRole
}

/** Readable on light and dark backgrounds, with white letters on top (6-digit hex for the carets). */
const COLORS = [
  '#e8590c',
  '#1c7ed6',
  '#2f9e44',
  '#ae3ec9',
  '#d6336c',
  '#0c8599',
  '#e03131',
  '#6741d9',
  '#5c940d',
  '#1971c2',
]

export function colorFor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length] as string
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
      name: user.name,
      email: user.email ?? '',
      color: user.color ?? colorFor(id),
      role: user.role ?? 'edit',
    })
  }
  return out
}
