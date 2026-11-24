import type { CommentThread } from '../comments'
import type { SqlDriver } from '../platform'
import {
  parseProtectedReference,
  protectedReferenceMatches,
  REDACTED_PROTECTED_FRAGMENT,
} from './reference'

export interface ProtectionChange {
  fragmentId: string
  reference: string
  /** Values as plain text and as serialized Markdown. Never stored in this form. */
  values: readonly string[]
  retiredShared?: { fragmentId: string; sharedId: string }
}

export async function scrubProtectedCopies(
  tx: Pick<SqlDriver, 'execute' | 'query'>,
  noteId: string,
  change: ProtectionChange,
  queue = true,
) {
  const replacement = REDACTED_PROTECTED_FRAGMENT
  await tx.execute('DELETE FROM chunks WHERE note_id = ?', [noteId])
  await tx.execute('UPDATE notes SET indexed_at = NULL, indexed_hash = NULL WHERE id = ?', [noteId])
  await tx.execute('DELETE FROM tidy_suggestions WHERE note_id = ?', [noteId])
  await tx.execute(
    "INSERT INTO kv (key, value) VALUES ('privacy.revision', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
  )
  const uniqueValues = [...new Set(change.values.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  for (const value of uniqueValues) {
    const json = JSON.stringify(value).slice(1, -1)
    const doubleJson = JSON.stringify(json).slice(1, -1)
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
      `UPDATE chat_messages
          SET content = replace(content, ?, ?),
              trace = replace(replace(trace, ?, ?), ?, ?),
              citations = replace(citations, ?, ?)`,
      [value, replacement, doubleJson, replacement, json, replacement, json, replacement],
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
  if (uniqueValues.length) {
    const scrubText = (text: string): string => {
      let out = text
      for (const target of uniqueValues) out = out.replaceAll(target, replacement)
      return out
    }
    const jsonValues = uniqueValues.map((v) => JSON.stringify(v).slice(1, -1))
    const conds = ['note_id = ?', ...jsonValues.map(() => 'instr(payload, ?) > 0')]
    const commentRows = await tx.query<{ id: string; payload: string }>(
      `SELECT id, payload FROM note_comments WHERE ${conds.join(' OR ')}`,
      [noteId, ...jsonValues],
    )
    for (const row of commentRows) {
      let nextPayload: string | null = null
      try {
        const parsed = JSON.parse(row.payload) as Partial<CommentThread>
        let dirty = false
        for (const field of ['quote', 'contextBefore', 'contextAfter'] as const) {
          const raw = parsed[field]
          if (typeof raw === 'string') {
            const next = scrubText(raw)
            if (next !== raw) {
              parsed[field] = next
              dirty = true
            }
          }
        }
        if (Array.isArray(parsed.messages)) {
          for (const msg of parsed.messages) {
            if (msg && typeof msg.body === 'string') {
              const next = scrubText(msg.body)
              if (next !== msg.body) {
                msg.body = next
                dirty = true
              }
            }
          }
        }
        if (dirty) nextPayload = JSON.stringify(parsed)
      } catch {
        let fallback = row.payload
        for (let i = 0; i < uniqueValues.length; i++) {
          fallback = fallback
            .replaceAll(jsonValues[i] as string, replacement)
            .replaceAll(uniqueValues[i] as string, replacement)
        }
        if (fallback !== row.payload) nextPayload = fallback
      }
      if (nextPayload !== null) {
        await tx.execute('UPDATE note_comments SET payload = ? WHERE id = ?', [nextPayload, row.id])
      }
    }
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
