import {
  cryptoReady,
  newNoteKey,
  noteKeyBytes,
  openProtectedFragment,
  type ProtectedFragmentIdentity,
  ProtectedFragments,
  type ProtectedReference,
  parseProtectedReference,
  protectedReference,
  protectedReferenceMatches,
  type SqlDriver,
  sealProtectedFragment,
} from '@fixnote/core'
import { attachmentSync, requestSync, sharedContext } from './account/account'
import { platform } from './platform'

const KEY_NAME = 'privacy.fragments.device.v1'
const ROW_PREFIX = 'privacy.fragment.'
const personalRemoteId = (id: string) => `protected-v1/${id}`
const TEXT_BYTES = 384 * 1024
const vault = () => new ProtectedFragments(platform.blobs)
let deviceKey: Promise<Uint8Array> | undefined

interface FragmentBody {
  text: string
  markdown: string
}

async function getDeviceKey() {
  await cryptoReady()
  const stored = await platform.secrets.get(KEY_NAME)
  if (stored) return noteKeyBytes(stored)
  const key = newNoteKey()
  await platform.secrets.set(KEY_NAME, key)
  return noteKeyBytes(key)
}

export function privacyDeviceKey() {
  const load = () =>
    navigator.locks ? navigator.locks.request(KEY_NAME, getDeviceKey) : getDeviceKey()
  deviceKey ??= load().catch((error: unknown) => {
    deviceKey = undefined
    throw error
  })
  return deviceKey
}

let fingerprintKey: Promise<CryptoKey> | undefined

export async function secretFingerprint(kind: string, value: string): Promise<string> {
  fingerprintKey ??= privacyDeviceKey()
    .then(async (key) => {
      const input = new Uint8Array(16 + key.length)
      input.set(new TextEncoder().encode('fixnote-dismiss:'))
      input.set(key, 16)
      const digest = await crypto.subtle.digest('SHA-256', input)
      return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
      ])
    })
    .catch((err: unknown) => {
      fingerprintKey = undefined
      throw err
    })
  const digest = await crypto.subtle.sign(
    'HMAC',
    await fingerprintKey,
    new TextEncoder().encode([kind, value].join('\u0000')),
  )
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('')
}

const dismissalKey = (id: string) => `privacy.dismissed.${id}`

export async function readPrivacyDismissals(db: SqlDriver, id: string): Promise<Set<string>> {
  const [row] = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
    dismissalKey(id),
  ])
  if (!row) return new Set()
  try {
    return new Set(JSON.parse(row.value) as string[])
  } catch {
    return new Set()
  }
}

export async function writePrivacyDismissals(db: SqlDriver, id: string, values: Set<string>) {
  await db.execute(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [dismissalKey(id), JSON.stringify([...values].slice(-256))],
  )
}

export async function clearProtectedDeviceKey() {
  deviceKey = undefined
  fingerprintKey = undefined
  await platform.secrets.delete(KEY_NAME)
}

// Personal records can travel with a note when shared or moved. Their encryption key and
// transport remain personal. A members record is bound to the permanent room id.
const binding = (audience: ProtectedReference['audience'], sharedId?: string) =>
  audience === 'personal' ? 'personal' : (sharedId ?? '')

function destination(ref: ProtectedReference, sharedId?: string) {
  const identity: ProtectedFragmentIdentity = { ...ref, noteId: binding(ref.audience, sharedId) }
  if (!identity.noteId) return null
  if (ref.audience === 'personal') {
    const sync = attachmentSync()
    return sync
      ? {
          identity,
          key: sync.keys.wrapKey,
          upload: (id: string, data: Uint8Array) => sync.remote.upload(personalRemoteId(id), data),
          download: (id: string) => sync.remote.download(personalRemoteId(id)),
        }
      : null
  }
  const ctx = sharedContext()
  if (!ctx || !sharedId) return null
  return {
    identity,
    async key() {
      const doc = await ctx.shared.doc(sharedId)
      return doc ? noteKeyBytes(doc.noteKey) : null
    },
    upload: (id: string, data: Uint8Array) => ctx.shared.putProtectedFragment(sharedId, id, data),
    download: (id: string) => ctx.shared.getProtectedFragment(sharedId, id),
  }
}

export async function stageProtectedFragment(
  db: SqlDriver,
  body: FragmentBody,
  audience: ProtectedReference['audience'],
  sharedId?: string,
): Promise<ProtectedReference> {
  const noteId = binding(audience, sharedId)
  if (!noteId) throw new Error('Missing protected fragment scope')
  const ref = await vault().create(
    { noteId, audience },
    await privacyDeviceKey(),
    JSON.stringify(body),
  )
  try {
    await db.execute('INSERT INTO kv (key, value) VALUES (?, ?)', [
      ROW_PREFIX + ref.fragmentId,
      JSON.stringify({
        audience,
        sharedId: audience === 'members' ? sharedId : undefined,
        pending: false,
      }),
    ])
  } catch (err) {
    await vault()
      .remove(ref.fragmentId)
      .catch(() => undefined)
    throw err
  }
  return ref
}

export function protectedFragmentSaved() {
  requestSync()
}

export async function discardProtectedFragment(db: SqlDriver, ref: ProtectedReference) {
  await db.execute('DELETE FROM kv WHERE key = ?', [ROW_PREFIX + ref.fragmentId])
  await vault().remove(ref.fragmentId)
}

/** Read only for a visible editor reference. The generic attachment loader cannot open this format. */
async function loadRecord(
  ref: ProtectedReference,
  sharedId: string | undefined,
  allowRemote: boolean,
): Promise<string | null> {
  const target = destination(ref, sharedId)
  // A team fragment must be in a room whose membership this device currently holds.
  if (
    ref.audience === 'members' &&
    (!target || typeof target.key !== 'function' || !(await target.key()))
  )
    return null
  const identity = { ...ref, noteId: binding(ref.audience, sharedId) }
  const key = await privacyDeviceKey()
  const local = await vault().read(identity, key)
  if (local !== null || !target || !allowRemote) return local
  const remoteKey = typeof target.key === 'function' ? await target.key() : target.key
  if (!remoteKey) return null
  const downloaded = await target.download(ref.fragmentId)
  if (!downloaded || downloaded.byteLength > TEXT_BYTES) return null
  const text = openProtectedFragment(
    remoteKey,
    target.identity,
    new TextDecoder().decode(downloaded),
  )
  await vault().cache(identity, key, text)
  return text
}

export async function loadProtectedFragment(
  ref: ProtectedReference,
  sharedId: string | undefined,
  allowRemote: boolean,
): Promise<string | null> {
  const body = await loadRecord(ref, sharedId, allowRemote)
  return body === null ? null : (JSON.parse(body) as FragmentBody).text
}

export async function loadProtectedValues(ref: ProtectedReference, sharedId?: string) {
  const body = await loadRecord(ref, sharedId, true)
  if (!body) return []
  const { text, markdown } = JSON.parse(body) as FragmentBody
  return [...new Set([markdown, text].filter(Boolean))].sort((a, b) => b.length - a.length)
}

export async function detachProtectedFragments(db: SqlDriver, sharedId: string, content: string) {
  const replacements: Record<string, string> = {}
  for (const old of new Set(protectedReferenceMatches(content).map((match) => match[0]))) {
    const ref = parseProtectedReference(old)
    if (ref?.audience !== 'members') continue
    const body = await loadRecord(ref, sharedId, true)
    if (!body) throw new Error('A protected passage is unavailable. Sync the note and try again.')
    const next = await stageProtectedFragment(db, JSON.parse(body) as FragmentBody, 'personal')
    await db.execute("UPDATE kv SET value = json_set(value, '$.pending', 1) WHERE key = ?", [
      ROW_PREFIX + next.fragmentId,
    ])
    replacements[old] = protectedReference(next)
  }
  return replacements
}

export async function syncProtectedFragments(db: SqlDriver, pushPersonal: boolean) {
  const rows = await db.query<{ key: string; value: string }>(
    "SELECT key, value FROM kv WHERE key LIKE 'privacy.fragment.%' AND json_extract(value, '$.pending') = 1",
  )
  for (const row of rows) {
    const { audience, sharedId } = JSON.parse(row.value) as {
      audience: ProtectedReference['audience']
      sharedId?: string
    }
    if (audience === 'personal' && !pushPersonal) continue
    const ref = { fragmentId: row.key.slice(ROW_PREFIX.length), audience }
    const target = destination(ref, sharedId)
    if (!target) continue
    const key = typeof target.key === 'function' ? await target.key() : target.key
    if (!key) continue
    const text = await vault().read(target.identity, await privacyDeviceKey())
    if (text === null) continue
    try {
      await target.upload(
        ref.fragmentId,
        new TextEncoder().encode(sealProtectedFragment(key, target.identity, text)),
      )
    } catch {
      continue
    }
    await db.execute("UPDATE kv SET value = json_set(value, '$.pending', 0) WHERE key = ?", [
      row.key,
    ])
  }
  const context = sharedContext()
  if (!context) return
  const retired = await db.query<{ key: string; value: string }>(
    "SELECT key, value FROM kv WHERE key LIKE 'privacy.retired.%'",
  )
  for (const entry of retired) {
    const id = entry.key.slice('privacy.retired.'.length)
    try {
      // Replace the old shared ciphertext using the existing editor-only file operation.
      // The old reference remains safe on disconnected devices that already had access.
      await context.shared.putProtectedFragment(entry.value, id, new Uint8Array([0]))
      await db.execute('DELETE FROM kv WHERE key = ?', [entry.key])
    } catch {
      // Retry once membership and connectivity allow it.
    }
  }
}
