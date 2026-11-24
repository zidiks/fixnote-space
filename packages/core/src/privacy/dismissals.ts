import type { SqlDriver } from '../platform'
import type { SecretKind } from './detect'

export const PRIVACY_DISMISSED_KEY = 'privacy.dismissed.v2'
const LEGACY_PREFIX = 'privacy.dismissed.'
const LEGACY_HASH = /^[0-9a-f]{64}$/
const MAX_DISMISSALS = 1024

/**
 * Canonical form of a candidate value so editor text (`protectedRangeText`) and background
 * Markdown scans (`toPlainText`), as well as trivial formatting/whitespace edits, hash identically.
 */
export function normalizeDismissedValue(kind: string, value: string): string {
  const unified = value.replace(/\r\n?/g, '\n')
  if (kind === 'privateKey') {
    return unified
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  }
  if (kind === 'token') {
    return unified.trim().replace(/^["'`*_\s]+|["'`*_\s]+$/g, '')
  }
  const collapsed = unified.replace(/\s+/g, ' ').trim()
  const cleaned = collapsed
    .replace(/[,;.:]+$/, '')
    .trim()
    .replace(/^["'`*_]+|["'`*_]+$/g, '')
    .replace(/[,;.:]+$/, '')
    .trim()
  return (cleaned || collapsed).toLowerCase()
}

/**
 * Leading phrase stem for multi-word prose matched by free-form field detectors (`password`,
 * `personalData`). Scoped per note so continuing to edit a dismissed non-secret sentence does not
 * re-trigger detection on every keystroke, while replacing it with a real single-token secret still
 * gets caught.
 */
export function dismissalStem(kind: string, normalized: string): string | null {
  if (kind !== 'password' && kind !== 'personalData') return null
  if (!normalized.includes(' ')) return null
  const words = normalized.split(' ').filter(Boolean)
  if (words.length < 2) return null
  let stem = words.slice(0, 2).join(' ')
  if (stem.length < 6 && words.length >= 3) stem = words.slice(0, 3).join(' ')
  if (stem.length > 24) stem = stem.slice(0, 24).trimEnd()
  return stem.length >= 6 ? stem : null
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('')
}

/**
 * Keyed, plaintext-free dismissal store shared by the editor and the background library scanner.
 * Keeps a single capped LRU row in `kv` (`privacy.dismissed.v2`), loaded once into memory, so
 * checking candidates across thousands of notes takes zero extra SQLite queries and O(1) lookups.
 */
export class PrivacyDismissals {
  private entries = new Set<string>()
  private hasLegacy = false
  private loaded: Promise<void> | undefined
  private hmacKey: Promise<CryptoKey> | undefined
  private writeChain: Promise<void> = Promise.resolve()

  constructor(
    private readonly db: SqlDriver,
    private readonly getDeviceKey: () => Promise<Uint8Array>,
  ) {}

  private deriveKey(): Promise<CryptoKey> {
    this.hmacKey ??= this.getDeviceKey()
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
        this.hmacKey = undefined
        throw err
      })
    return this.hmacKey
  }

  private async sign(message: string): Promise<Uint8Array> {
    const digest = await crypto.subtle.sign(
      'HMAC',
      await this.deriveKey(),
      new TextEncoder().encode(message),
    )
    return new Uint8Array(digest)
  }

  private async globalToken(kind: string, value: string): Promise<string> {
    const normalized = normalizeDismissedValue(kind, value)
    const digest = await this.sign(`g\u0000${kind}\u0000${normalized}`)
    return `g:${toBase64Url(digest.subarray(0, 16))}`
  }

  private async stemToken(noteId: string, kind: string, value: string): Promise<string | null> {
    const stem = dismissalStem(kind, normalizeDismissedValue(kind, value))
    if (!stem) return null
    const digest = await this.sign(`n\u0000${noteId}\u0000${kind}\u0000${stem}`)
    return `n:${toBase64Url(digest.subarray(0, 16))}`
  }

  /** Legacy 64-char hex HMAC for backwards compatibility with earlier per-note rows. */
  async legacyFingerprint(kind: string, value: string): Promise<string> {
    return toHex(await this.sign(`${kind}\u0000${value}`))
  }

  private touch(token: string) {
    this.entries.delete(token)
    this.entries.add(token)
    if (LEGACY_HASH.test(token)) this.hasLegacy = true
  }

  private trim() {
    while (this.entries.size > MAX_DISMISSALS) {
      const oldest = this.entries.values().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    if (this.hasLegacy) {
      this.hasLegacy = false
      for (const entry of this.entries) {
        if (LEGACY_HASH.test(entry)) {
          this.hasLegacy = true
          break
        }
      }
    }
  }

  private ensureLoaded(): Promise<void> {
    this.loaded ??= this.load().catch((err: unknown) => {
      this.loaded = undefined
      throw err
    })
    return this.loaded
  }

  private async load(): Promise<void> {
    const rows = await this.db.query<{ key: string; value: string }>(
      "SELECT key, value FROM kv WHERE key LIKE 'privacy.dismissed.%'",
    )
    const legacyKeys: string[] = []
    let v2Row: string | undefined
    for (const row of rows) {
      if (row.key === PRIVACY_DISMISSED_KEY) {
        v2Row = row.value
      } else if (row.key.startsWith(LEGACY_PREFIX)) {
        legacyKeys.push(row.key)
        this.absorbJson(row.value)
      }
    }
    if (v2Row) this.absorbJson(v2Row)
    this.trim()
    if (legacyKeys.length) {
      await this.db.transaction(async (tx) => {
        await tx.execute(
          'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          [PRIVACY_DISMISSED_KEY, JSON.stringify([...this.entries])],
        )
        for (const key of legacyKeys) {
          await tx.execute('DELETE FROM kv WHERE key = ?', [key])
        }
      })
    }
  }

  private absorbJson(raw: string) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return
      for (const item of parsed) {
        if (typeof item === 'string' && item) this.touch(item)
      }
    } catch {
      // Ignore malformed rows.
    }
  }

  private persist(): Promise<void> {
    const payload = JSON.stringify([...this.entries])
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        await this.db.execute(
          'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          [PRIVACY_DISMISSED_KEY, payload],
        )
      })
    return this.writeChain
  }

  async isEmpty(): Promise<boolean> {
    await this.ensureLoaded()
    return this.entries.size === 0
  }

  async isDismissed(noteId: string, kind: SecretKind | string, value: string): Promise<boolean> {
    await this.ensureLoaded()
    if (this.entries.size === 0) return false
    const global = await this.globalToken(kind, value)
    if (this.entries.has(global)) return true
    const stem = await this.stemToken(noteId, kind, value)
    if (stem && this.entries.has(stem)) return true
    if (this.hasLegacy) {
      const legacy = await this.legacyFingerprint(kind, value)
      if (this.entries.has(legacy)) return true
    }
    return false
  }

  async dismiss(noteId: string, kind: SecretKind | string, value: string): Promise<void> {
    await this.ensureLoaded()
    const global = await this.globalToken(kind, value)
    const stem = await this.stemToken(noteId, kind, value)
    this.touch(global)
    if (stem) this.touch(stem)
    this.trim()
    await this.persist()
  }
}
