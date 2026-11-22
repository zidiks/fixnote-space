import type { SqlDriver } from '../platform'
import { parseProtectedReference, protectedReferenceMatches } from './reference'

export interface ProtectionChange {
  fragmentId: string
  reference: string
  /** Values as plain text and as serialized Markdown. Never stored in this form. */
  values: readonly string[]
  retiredShared?: { fragmentId: string; sharedId: string }
}

export async function scrubProtectedCopies(
  tx: Pick<SqlDriver, 'execute'>,
  noteId: string,
  change: ProtectionChange,
  queue = true,
) {
  const replacement = '[protected fragment]'
  await tx.execute('DELETE FROM chunks WHERE note_id = ?', [noteId])
  await tx.execute('UPDATE notes SET indexed_at = NULL, indexed_hash = NULL WHERE id = ?', [noteId])
  await tx.execute('DELETE FROM tidy_suggestions WHERE note_id = ?', [noteId])
  await tx.execute(
    "INSERT INTO kv (key, value) VALUES ('privacy.revision', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
  )
  for (const value of new Set(change.values.filter(Boolean))) {
    const json = JSON.stringify(value).slice(1, -1)
    await tx.execute('UPDATE notes SET base_content = replace(base_content, ?, ?) WHERE id = ?', [
      value,
      change.reference,
      noteId,
    ])
    await tx.execute(
      'DELETE FROM ai_actions WHERE instr(changes, ?) OR instr(summary, ?) OR instr(memory, ?)',
      [json, value, json],
    )
    await tx.execute(
      'UPDATE chat_messages SET content = replace(content, ?, ?), trace = replace(trace, ?, ?), citations = replace(citations, ?, ?)',
      [value, replacement, json, replacement, json, replacement],
    )
    await tx.execute(
      "UPDATE kv SET value = replace(value, CASE WHEN key = 'chat.summary' THEN ? ELSE ? END, ?) WHERE key IN ('assistant.memory', 'chat.summary')",
      [json, value, replacement],
    )
    await tx.execute('DELETE FROM link_previews WHERE instr(url, ?) OR instr(url, ?)', [
      value,
      encodeURIComponent(value),
    ])
  }
  if (queue) {
    await tx.execute("UPDATE kv SET value = json_set(value, '$.pending', 1) WHERE key = ?", [
      `privacy.fragment.${change.fragmentId}`,
    ])
    const old = change.retiredShared
    if (old) {
      // Keep the encrypted local version for recovery. Do not upload it again.
      await tx.execute("UPDATE kv SET value = json_set(value, '$.pending', 0) WHERE key = ?", [
        `privacy.fragment.${old.fragmentId}`,
      ])
      await tx.execute('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [
        `privacy.retired.${old.fragmentId}`,
        old.sharedId,
      ])
    }
  }
}

/** A received protection normally changes one exact range while preserving its surroundings. */
export function receivedProtection(before: string, after: string): ProtectionChange[] {
  const previous = new Set(protectedReferenceMatches(before).map((match) => match[0]))
  const added = protectedReferenceMatches(after).filter((match) => !previous.has(match[0]))
  return added.flatMap((match) => {
    const ref = parseProtectedReference(match[0])
    if (!ref) return []
    let values: string[] = []
    if (added.length === 1) {
      const prefix = after.slice(0, match.index)
      const suffix = after.slice(match.index + match[0].length)
      if (
        before.length >= prefix.length + suffix.length &&
        before.startsWith(prefix) &&
        before.endsWith(suffix)
      ) {
        values = [before.slice(prefix.length, before.length - suffix.length)]
      }
    }
    return [{ fragmentId: ref.fragmentId, reference: match[0], values }]
  })
}
