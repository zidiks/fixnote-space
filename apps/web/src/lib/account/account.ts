import {
  type AccountKeys,
  cryptoReady,
  deriveKeys,
  type KeyStore,
  makeKeyCheck,
  newRecoverySecret,
  phraseToSecret,
  publicKeyB64,
  type SqlDriver,
  SyncEngine,
  verifyKeyCheck,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { create } from 'zustand'
import { conflictHeading } from '../conflict'
import type { AccountBackend, Session } from './backend'

export type Phase =
  | 'disabled' // no backend configured in this build
  | 'loading'
  | 'signed-out'
  | 'code-sent'
  | 'new-account' // show the freshly generated phrase
  | 'confirm-phrase' // user re-types a few words
  | 'needs-phrase' // account exists, this device has no key yet
  | 'wrong-account' // local notes belong to another account
  | 'ready'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

interface AccountState {
  phase: Phase
  email: string
  ownerEmail: string
  /** Only while creating an account: the secret behind the phrase on screen. */
  pendingSecret: Uint8Array | null
  sync: { status: SyncStatus; lastSyncedAt: number | null; error: string | null; pending: number }
}

export const useAccount = create<AccountState>()(() => ({
  phase: 'loading',
  email: '',
  ownerEmail: '',
  pendingSecret: null,
  sync: { status: 'idle', lastSyncedAt: null, error: null, pending: 0 },
}))

const set = useAccount.setState
const setSync = (patch: Partial<AccountState['sync']>) =>
  set((s) => ({ sync: { ...s.sync, ...patch } }))

interface Deps {
  backend: AccountBackend | null
  db: SqlDriver
  keyStore: KeyStore
  /** Refresh UI queries after remote changes arrived. */
  onRemoteChange: () => void
}

let deps: Deps | null = null
let keys: AccountKeys | null = null
let session: Session | null = null
let engine: SyncEngine | null = null
let stopWatching: (() => void) | null = null
let debounce: ReturnType<typeof setTimeout> | undefined

const OWNER = 'account.owner'
const OWNER_EMAIL = 'account.email'
const SYNC_DELAY = 1200
const SYNC_INTERVAL = 60_000

async function kvGet(key: string): Promise<string | null> {
  const [row] = await need().db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
    key,
  ])
  return row?.value ?? null
}

async function kvSet(key: string, value: string) {
  await need().db.execute(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  )
}

function need(): Deps {
  if (!deps) throw new Error('Account is not initialized')
  return deps
}

function backend(): AccountBackend {
  const b = need().backend
  if (!b) throw new Error('No sync backend configured')
  return b
}

const isOffline = (err: unknown) =>
  !navigator.onLine ||
  err instanceof TypeError ||
  /fetch|network|failed to fetch|load failed/i.test(
    err instanceof Error ? err.message : String(err),
  )

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function initAccount(d: Deps) {
  deps = d
  if (!d.backend) {
    set({ phase: 'disabled' })
    return
  }
  await cryptoReady()
  try {
    const s = await d.backend.getSession()
    if (s) await resolveSession(s)
    else set({ phase: 'signed-out' })
  } catch {
    set({ phase: 'signed-out' })
  }
}

/** After sign-in (or on start with a stored session): decide which step the user is at. */
async function resolveSession(s: Session) {
  session = s
  set({ email: s.email })
  const owner = await kvGet(OWNER)
  if (owner && owner !== s.userId) {
    set({ phase: 'wrong-account', ownerEmail: (await kvGet(OWNER_EMAIL)) ?? '' })
    return
  }
  const stored = await need()
    .keyStore.load()
    .catch(() => null)
  if (stored) {
    const k = deriveKeys(stored)
    try {
      const row = await backend().getUserKeys()
      if (row && !verifyKeyCheck(k, row.keyCheck)) {
        // The account's keys changed elsewhere; the stored secret no longer opens anything.
        await need().keyStore.clear()
        set({ phase: 'needs-phrase' })
        return
      }
    } catch {
      // Offline start: trust the stored key and sync later.
    }
    await becomeReady(k)
    return
  }
  const row = await backend().getUserKeys()
  if (row) set({ phase: 'needs-phrase' })
  else set({ phase: 'new-account', pendingSecret: newRecoverySecret() })
}

async function becomeReady(k: AccountKeys) {
  keys = k
  if (session) {
    await kvSet(OWNER, session.userId)
    await kvSet(OWNER_EMAIL, session.email)
  }
  engine = new SyncEngine(need().db, backend().remote, k, { conflictHeading })
  set({ phase: 'ready', pendingSecret: null })
  startWatching()
  void runSync()
}

function startWatching() {
  stopWatching?.()
  const unsubscribe = session ? backend().subscribe(session.userId, requestSync) : () => undefined
  const interval = setInterval(requestSync, SYNC_INTERVAL)
  const online = () => requestSync()
  window.addEventListener('online', online)
  stopWatching = () => {
    unsubscribe()
    clearInterval(interval)
    window.removeEventListener('online', online)
  }
}

// ── Sign-in steps ────────────────────────────────────────────────────────────

export async function sendCode(email: string) {
  await backend().sendCode(email.trim(), i18n.resolvedLanguage ?? 'en')
  set({ phase: 'code-sent', email: email.trim() })
}

export async function verifyCode(code: string) {
  const s = await backend().verifyCode(useAccount.getState().email, code.trim())
  await resolveSession(s)
}

export function backToEmail() {
  set({ phase: 'signed-out' })
}

export function phraseSaved() {
  set({ phase: 'confirm-phrase' })
}

export function backToPhrase() {
  set({ phase: 'new-account' })
}

/** New account: publish the public key and key check, keep the secret on this device. */
export async function finishNewAccount() {
  const secret = useAccount.getState().pendingSecret
  if (!secret) throw new Error('No pending secret')
  const k = deriveKeys(secret)
  await backend().createUserKeys({ publicKey: publicKeyB64(k), keyCheck: makeKeyCheck(k) })
  await need().keyStore.save(secret)
  await becomeReady(k)
}

/** Existing account on a new device. */
export async function unlockWithPhrase(phrase: string): Promise<'ok' | 'invalid' | 'wrong'> {
  const secret = phraseToSecret(phrase)
  if (!secret) return 'invalid'
  const k = deriveKeys(secret)
  const row = await backend().getUserKeys()
  if (!row || !verifyKeyCheck(k, row.keyCheck)) return 'wrong'
  await need().keyStore.save(secret)
  await becomeReady(k)
  return 'ok'
}

export async function signOut() {
  stopWatching?.()
  stopWatching = null
  clearTimeout(debounce)
  engine = null
  keys = null
  session = null
  await need()
    .keyStore.clear()
    .catch(() => undefined)
  await backend().signOut()
  set({
    phase: 'signed-out',
    email: '',
    pendingSecret: null,
    sync: { status: 'idle', lastSyncedAt: null, error: null, pending: 0 },
  })
}

/** The unlocked account's recovery secret, for "show recovery phrase". */
export function currentSecret(): Uint8Array | null {
  return keys?.secret ?? null
}

// ── Sync ─────────────────────────────────────────────────────────────────────

/** Local data changed: sync soon, batching bursts of edits. */
export function requestSync() {
  if (!engine) return
  clearTimeout(debounce)
  debounce = setTimeout(() => void runSync(), SYNC_DELAY)
}

export async function runSync() {
  const e = engine
  if (!e) return
  setSync({ status: 'syncing' })
  try {
    const report = await e.sync()
    setSync({
      status: 'idle',
      lastSyncedAt: Date.now(),
      error: null,
      pending: await e.pendingCount(),
    })
    if (report.pulled || report.merged || report.conflictCopies) need().onRemoteChange()
  } catch (err) {
    setSync({
      status: isOffline(err) ? 'offline' : 'error',
      error: err instanceof Error ? err.message : String(err),
      pending: await e.pendingCount().catch(() => 0),
    })
  }
}
