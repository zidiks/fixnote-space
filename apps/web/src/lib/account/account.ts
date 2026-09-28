import {
  type AccountKeys,
  type AttachmentRemote,
  type AttachmentSource,
  type Attachments,
  accountSource,
  anySource,
  attachmentIds,
  cryptoReady,
  deriveKeys,
  importInbox,
  type KeyStore,
  makeKeyCheck,
  type NotesRepo,
  newPairingKeys,
  newRecoverySecret,
  openSecretFromDevice,
  type PairingKeys,
  pairingCode,
  phraseToSecret,
  publicKeyB64,
  SharedNotes,
  type SharedSyncReport,
  type SqlDriver,
  SyncEngine,
  sealSecretForDevice,
  verifyKeyCheck,
} from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { create } from 'zustand'
import { conflictHeading } from '../conflict'
import { isProRequired, toPlanInfo, usePlan } from '../plan'
import { projector } from '../shared/projector'
import type { AccountBackend, PairingRequest, Session } from './backend'

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

/** 'free': signed in on Free, so this device only downloads (sync is part of Pro). */
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'free'

interface AccountState {
  phase: Phase
  email: string
  ownerEmail: string
  /** Only while creating an account: the secret behind the phrase on screen. */
  pendingSecret: Uint8Array | null
  sync: { status: SyncStatus; lastSyncedAt: number | null; error: string | null; pending: number }
  /** This device waits for another one to let it in; `code` must match on both screens. */
  pairing: { code: string; status: 'waiting' | 'expired' } | null
  /** Other devices asking this one to let them in. */
  pairingRequests: (PairingRequest & { code: string })[]
  /** Shared notes this account is invited to and has not answered yet. */
  invites: string[]
}

export const useAccount = create<AccountState>()(() => ({
  phase: 'loading',
  email: '',
  ownerEmail: '',
  pendingSecret: null,
  sync: { status: 'idle', lastSyncedAt: null, error: null, pending: 0 },
  pairing: null,
  pairingRequests: [],
  invites: [],
}))

const set = useAccount.setState
const setSync = (patch: Partial<AccountState['sync']>) =>
  set((s) => ({ sync: { ...s.sync, ...patch } }))

interface Deps {
  backend: AccountBackend | null
  db: SqlDriver
  keyStore: KeyStore
  attachments: Attachments
  repo: NotesRepo
  /** Speech to text for voice messages from capture channels; may fail (model unavailable). */
  transcribe: (audio: Blob) => Promise<string>
  /** Where a captured message goes (a new note, or today's note). */
  saveCaptured?: (content: string) => Promise<void>
  /** Messages from Telegram became notes. */
  onCaptured: (count: number) => void
  /** Refresh UI queries after remote changes arrived. */
  onRemoteChange: () => void
  /** Sync kept a second version of notes changed in the same place on two devices. */
  onConflicts?: (count: number) => void
}

const sharedListeners = new Set<(report: SharedSyncReport) => void>()

/** Calls back after each sync of shared notes (roles changed, access lost, …). */
export function onSharedSync(listener: (report: SharedSyncReport) => void): () => void {
  sharedListeners.add(listener)
  return () => sharedListeners.delete(listener)
}

let deps: Deps | null = null
let keys: AccountKeys | null = null
let session: Session | null = null
let engine: SyncEngine | null = null
let shared: SharedNotes | null = null
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
  shared = session
    ? new SharedNotes({
        db: need().db,
        repo: need().repo,
        keys: k,
        remote: backend().shared(session.userId),
        projector,
        userId: session.userId,
      })
    : null
  set({ phase: 'ready', pendingSecret: null })
  startWatching()
  // The plan first, so a Free account does not try to push.
  void refreshPlan(true).then(runSync)
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

/** Showing the recovery phrase: a code to the account's email first. */
export async function sendPhraseCode() {
  await backend().sendCheckCode(useAccount.getState().email, i18n.resolvedLanguage ?? 'en')
}

export async function checkPhraseCode(code: string): Promise<boolean> {
  return backend().checkCode(useAccount.getState().email, code.trim())
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

// ── Adding a device without the phrase ───────────────────────────────────────

const PAIRING_POLL = 2000
const PAIRING_TTL = 10 * 60_000
let pairingRun = 0

/** A short name for this device (the other device's prompt, a live-editing cursor). */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  const app =
    '__TAURI_INTERNALS__' in window
      ? 'FixNote'
      : /Edg\//.test(ua)
        ? 'Edge'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : ''
  return [app, os].filter(Boolean).join(' · ')
}

/**
 * New device, signed in but without the key: ask a device that is set up to let it in. Resolves
 * when this device is unlocked, or when the request expired or was declined.
 */
export async function startPairing(): Promise<'ok' | 'expired' | 'cancelled'> {
  const run = ++pairingRun
  const k: PairingKeys = newPairingKeys()
  const id = await backend().createPairing(k.publicKey, deviceLabel())
  set({ pairing: { code: pairingCode(k.publicKey), status: 'waiting' } })
  const started = Date.now()
  try {
    while (run === pairingRun && Date.now() - started < PAIRING_TTL) {
      await new Promise((r) => setTimeout(r, PAIRING_POLL))
      if (run !== pairingRun) break
      const row = await backend().getPairing(id)
      if (!row) {
        // Declined on the other device (or expired and cleaned up).
        set({ pairing: { code: '', status: 'expired' } })
        return 'expired'
      }
      if (!row.sealedSecret) continue
      const secret = openSecretFromDevice(row.sealedSecret, k)
      const derived = deriveKeys(secret)
      const keysRow = await backend().getUserKeys()
      if (!keysRow || !verifyKeyCheck(derived, keysRow.keyCheck)) throw new Error('wrong key')
      await backend()
        .deletePairing(id)
        .catch(() => undefined)
      await need().keyStore.save(secret)
      set({ pairing: null })
      await becomeReady(derived)
      return 'ok'
    }
  } catch (err) {
    set({ pairing: null })
    throw err
  }
  await backend()
    .deletePairing(id)
    .catch(() => undefined)
  if (run !== pairingRun) return 'cancelled'
  set({ pairing: { code: '', status: 'expired' } })
  return 'expired'
}

export function cancelPairing() {
  pairingRun++
  set({ pairing: null })
}

/** Set-up device: lets the asking device in by sealing the account secret to its one-time key. */
export async function approvePairing(request: PairingRequest) {
  if (!keys) throw new Error('Account is locked')
  await backend().approvePairing(request.id, sealSecretForDevice(keys.secret, request.ephemeralKey))
  set((s) => ({ pairingRequests: s.pairingRequests.filter((r) => r.id !== request.id) }))
}

export async function declinePairing(request: PairingRequest) {
  await backend().deletePairing(request.id)
  set((s) => ({ pairingRequests: s.pairingRequests.filter((r) => r.id !== request.id) }))
}

async function refreshPairingRequests() {
  const requests = await backend().pendingPairings()
  set({ pairingRequests: requests.map((r) => ({ ...r, code: pairingCode(r.ephemeralKey) })) })
}

export async function signOut() {
  cancelPairing()
  stopWatching?.()
  stopWatching = null
  clearTimeout(debounce)
  engine = null
  shared = null
  keys = null
  session = null
  await need()
    .keyStore.clear()
    .catch(() => undefined)
  await backend().signOut()
  usePlan.setState({ info: null })
  planFetchedAt = 0
  set({
    phase: 'signed-out',
    email: '',
    pendingSecret: null,
    sync: { status: 'idle', lastSyncedAt: null, error: null, pending: 0 },
    invites: [],
  })
}

/** The unlocked account's recovery secret, for "show recovery phrase". */
export function currentSecret(): Uint8Array | null {
  return keys?.secret ?? null
}

// ── Sync ─────────────────────────────────────────────────────────────────────

let localOnly: () => boolean = () => false

/** The desktop "only on this device" switch (lives with the AI settings). */
export function setLocalOnlyCheck(check: () => boolean) {
  localOnly = check
}

/** Local data changed: sync soon, batching bursts of edits. */
export function requestSync() {
  if (!engine) return
  clearTimeout(debounce)
  debounce = setTimeout(() => void runSync(), SYNC_DELAY)
}

const PLAN_EVERY = 5 * 60_000
let planFetchedAt = 0

/**
 * Asks the server for the account's plan (at most every few minutes unless `force`). Offline the
 * last known plan stays; signed out there is none.
 */
export async function refreshPlan(force = false) {
  const b = deps?.backend
  if (!b || !session) {
    usePlan.setState({ info: null })
    return
  }
  if (!force && Date.now() - planFetchedAt < PLAN_EVERY) return
  planFetchedAt = Date.now()
  try {
    const info = toPlanInfo(await b.plan())
    usePlan.setState({ info })
    if (info.filesDeleteAt) void keepFilesHere()
  } catch {
    planFetchedAt = 0
  }
}

let keptFilesFor: string | null = null

/**
 * The server copy of the files is going (Free, never paid): fetch the ones this device does not
 * have, once per session, so every file the notes use stays on the device.
 */
async function keepFilesHere() {
  const source = attachmentSource()
  const d = deps
  if (!source || !d || !session || keptFilesFor === session.userId) return
  keptFilesFor = session.userId
  try {
    const ids = new Set((await d.repo.allContents()).flatMap(attachmentIds))
    await d.attachments.keepLocal([...ids], source)
  } catch {
    keptFilesFor = null
  }
}

let paymentStartedAt = 0

/**
 * Opens the payment page for Pro. The plan is then read again whenever the app comes back to the
 * front (for an hour), so Pro shows up as soon as Suby has told the server.
 */
export async function startCheckout(plan: 'month' | 'year', open: (url: string) => Promise<void>) {
  const url = await backend().checkout(plan)
  paymentStartedAt = Date.now()
  if (url) await open(url)
  await refreshPlan(true)
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    const waiting = Date.now() - paymentStartedAt < 3_600_000
    if (waiting && usePlan.getState().info?.plan !== 'pro') void refreshPlan(true)
    else if (waiting) paymentStartedAt = 0
  })
}

/** Back from the payment page on the web (`?billing=success`): look for Pro a few times. */
export function paymentReturned() {
  paymentStartedAt = Date.now()
  for (const delay of [1500, 5000, 15000]) setTimeout(() => void refreshPlan(true), delay)
}

export async function runSync() {
  const e = engine
  if (!e) return
  // "Only on this device": nothing is sent or fetched, the account just stays signed in.
  if (localOnly()) {
    setSync({ status: 'idle', error: null })
    return
  }
  setSync({ status: 'syncing' })
  // On Free this device only downloads; the server would refuse its changes anyway.
  const push = usePlan.getState().info?.plan !== 'free'
  try {
    const report = await e.sync({ push })
    // Notes shared with other people: their own channel, merged as Yjs documents.
    const sharedReport = shared ? await shared.sync() : null
    let sharedChanged = false
    if (sharedReport) {
      const invites = sharedReport.invites
      const invitesChanged = invites.join() !== useAccount.getState().invites.join()
      if (invitesChanged) set({ invites })
      for (const listener of sharedListeners) listener(sharedReport)
      sharedChanged = Boolean(
        sharedReport.added.length ||
          sharedReport.removed.length ||
          sharedReport.roles.length ||
          sharedReport.folders ||
          sharedReport.pulled ||
          invitesChanged,
      )
    }
    await refreshPairingRequests().catch(() => undefined)
    // Images go after the notes that use them; another device fetches them when shown.
    const sync = attachmentSync()
    if (sync) {
      // Messages sent to the bot become notes here, then go up with the next sync.
      const d = need()
      const captured = await importInbox({
        db: d.db,
        keys: sync.keys,
        remote: backend().inbox,
        repo: d.repo,
        attachments: d.attachments,
        transcribe: d.transcribe,
        ...(d.saveCaptured ? { save: d.saveCaptured } : {}),
      })
      if (captured.imported) {
        d.onCaptured(captured.imported)
        d.onRemoteChange()
        requestSync()
      }
      if (push) await d.attachments.uploadPending(sync.keys, sync.remote)
      // Files of shared notes go up under the note for every member, on any plan of one's own.
      if (shared) await shared.pushFiles(d.attachments).catch(() => 0)
    }
    void refreshPlan()
    setSync({
      status: push ? 'idle' : 'free',
      lastSyncedAt: Date.now(),
      error: null,
      pending: (await e.pendingCount()) + (await need().attachments.pendingCount()),
    })
    if (
      report.pulled ||
      report.merged ||
      report.conflictCopies ||
      report.dailiesMerged ||
      sharedChanged
    )
      need().onRemoteChange()
    if (report.conflictCopies) need().onConflicts?.(report.conflictCopies)
  } catch (err) {
    if (isProRequired(err)) {
      // Pro ended since the plan was last read: from now on this device only downloads.
      await refreshPlan(true)
      setSync({ status: 'free', error: null, pending: await e.pendingCount().catch(() => 0) })
      return
    }
    setSync({
      status: isOffline(err) ? 'offline' : 'error',
      error: err instanceof Error ? err.message : String(err),
      pending: await e.pendingCount().catch(() => 0),
    })
  }
}

/** Capture channel settings (Telegram), when signed in and unlocked. */
export function captureBackend() {
  return engine ? (deps?.backend ?? null) : null
}

/** Keys and storage for attachments, when signed in and unlocked. */
/**
 * Where a file this device lacks is fetched from: the account's own copy, else the copy under a
 * shared note that uses it (sealed with the note key). Undefined when signed out or locked.
 */
export function attachmentSource(): AttachmentSource | undefined {
  const sync = attachmentSync()
  if (!sync) return undefined
  return anySource(accountSource(sync.keys, sync.remote), shared?.fileSource())
}

export function attachmentSync(): { keys: AccountKeys; remote: AttachmentRemote } | undefined {
  const b = deps?.backend
  if (!b || !keys || !session || !engine) return undefined
  return { keys, remote: b.attachments(session.userId) }
}

/** Backend, keys and local files for shared links, when signed in and unlocked. */
export function shareContext() {
  const b = deps?.backend
  if (!b || !keys || !session || !engine) return null
  return { backend: b, keys, attachments: deps?.attachments as Attachments }
}

/** Shared notes and the backend for their live editing, when signed in and unlocked. */
export function sharedContext() {
  const b = deps?.backend
  if (!b || !keys || !session || !engine || !shared) return null
  return { backend: b, shared, userId: session.userId, email: session.email }
}

/** Reads a page for a link card through the server, or null when signed out. */
export async function fetchPageViaServer(url: string) {
  const b = deps?.backend
  return b ? b.fetchPage(url) : null
}

/** Endpoint for the assistant, or null when signed out / not configured. */
export async function chatTransport() {
  const b = deps?.backend
  return b ? b.chatTransport() : null
}
