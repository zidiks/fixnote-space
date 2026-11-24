import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareDatabase } from '../db/migrate'
import type { SqlDriver } from '../platform'
import { createMemoryDriver } from '../testing/memory-driver'
import {
  dismissalStem,
  normalizeDismissedValue,
  PRIVACY_DISMISSED_KEY,
  PrivacyDismissals,
} from './dismissals'

describe('privacy dismissals', () => {
  let db: SqlDriver
  const deviceKey = new Uint8Array(32).fill(7)
  const getKey = async () => deviceKey

  beforeEach(async () => {
    db = await createMemoryDriver()
    await prepareDatabase(db)
  })

  it('normalizes whitespace, formatting and multiline keys consistently', () => {
    expect(normalizeDismissedValue('password', '  **Demo   Pass**, ')).toBe('demo pass')
    expect(normalizeDismissedValue('token', ' `dev_token_12345678` ')).toBe('dev_token_12345678')
    expect(
      normalizeDismissedValue(
        'privateKey',
        '-----BEGIN PRIVATE KEY-----\r\n  abc  \r\n\r\ndef\r\n-----END PRIVATE KEY-----',
      ),
    ).toBe('-----BEGIN PRIVATE KEY-----\nabc\ndef\n-----END PRIVATE KEY-----')
  })

  it('extracts a prose stem only for multi-word password/personalData values', () => {
    expect(dismissalStem('password', 'нужно поменять на сервере')).toBe('нужно поменять')
    expect(dismissalStem('password', 'singlewordsecret')).toBeNull()
    expect(dismissalStem('token', 'ghp_12345678901234567890')).toBeNull()
    expect(dismissalStem('accessCode', '1234')).toBeNull()
  })

  it('suppresses dismissed fragments globally across notes without storing plaintext', async () => {
    const store = new PrivacyDismissals(db, getKey)
    expect(await store.isDismissed('note-a', 'token', 'sk_test_not_real_1234567890')).toBe(false)

    await store.dismiss('note-a', 'token', 'sk_test_not_real_1234567890')

    // Suppressed in another note, and after reloading from SQLite.
    const reloaded = new PrivacyDismissals(db, getKey)
    expect(await reloaded.isDismissed('note-b', 'token', 'sk_test_not_real_1234567890')).toBe(true)
    expect(await reloaded.isDismissed('note-b', 'token', '`sk_test_not_real_1234567890`')).toBe(
      true,
    )
    expect(await reloaded.isDismissed('note-b', 'token', 'sk_live_other_1234567890')).toBe(false)

    const rows = await db.query<{ key: string; value: string }>(
      "SELECT key, value FROM kv WHERE key LIKE 'privacy.dismissed.%'",
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.key).toBe(PRIVACY_DISMISSED_KEY)
    expect(rows[0]?.value).not.toContain('sk_test_not_real')
  })

  it('keeps prose field edits suppressed in the same note without hiding real secrets', async () => {
    const store = new PrivacyDismissals(db, getKey)
    await store.dismiss('note-a', 'password', 'нужно поменять на сервере')

    const reloaded = new PrivacyDismissals(db, getKey)
    // Continuing to edit the same dismissed sentence stays dismissed.
    expect(
      await reloaded.isDismissed('note-a', 'password', 'нужно поменять на сервере завтра'),
    ).toBe(true)
    // Replacing it with a real single-token password is still caught.
    expect(await reloaded.isDismissed('note-a', 'password', 'Tr0ub4dor&3!')).toBe(false)
    // Exact same sentence is dismissed globally; a different sentence in another note is not.
    expect(await reloaded.isDismissed('note-b', 'password', 'нужно поменять на сервере')).toBe(true)
    expect(
      await reloaded.isDismissed('note-b', 'password', 'нужно поменять на сервере завтра'),
    ).toBe(false)
  })

  it('migrates legacy per-note dismissal rows into a single cached row', async () => {
    const helper = new PrivacyDismissals(db, getKey)
    const legacyHash = await helper.legacyFingerprint('accessCode', '1234')
    await db.execute('INSERT INTO kv (key, value) VALUES (?, ?)', [
      'privacy.dismissed.note-legacy',
      JSON.stringify([legacyHash]),
    ])

    const spy = vi.spyOn(db, 'query')
    const store = new PrivacyDismissals(db, getKey)
    expect(await store.isDismissed('note-legacy', 'accessCode', '1234')).toBe(true)
    expect(await store.isDismissed('note-other', 'accessCode', '9999')).toBe(false)
    expect(await store.isDismissed('note-third', 'accessCode', '1234')).toBe(true)
    // Only one SELECT from kv across all checks.
    expect(spy).toHaveBeenCalledTimes(1)

    const rows = await db.query<{ key: string }>(
      "SELECT key FROM kv WHERE key LIKE 'privacy.dismissed.%'",
    )
    expect(rows.map((r) => r.key)).toEqual([PRIVACY_DISMISSED_KEY])
  })
})
