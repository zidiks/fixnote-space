/**
 * Platform boundary.
 *
 * All domain logic (schema, sync, crypto, retrieval, tidy) lives in @fixnote/core and talks to the
 * host only through these interfaces. Desktop (Tauri) and web (browser/PWA) ship their own
 * adapters; see docs/CONCEPT.md section 6.6.
 */

import type { PageFetcher } from './links/preview'

export type PlatformKind = 'desktop' | 'web'

/** A single SQL value as SQLite understands it. */
export type SqlValue = string | number | bigint | Uint8Array | null

export type SqlRow = Record<string, SqlValue>

/**
 * Minimal SQLite driver. Desktop: rusqlite via Tauri commands. Web: @sqlite.org/sqlite-wasm over OPFS.
 * The schema and every query are shared, so drivers must expose plain SQLite semantics with FTS5.
 */
export interface SqlDriver {
  /** Where data lives. `persistent: false` means changes are lost on reload. */
  readonly storage?: { persistent: boolean; detail?: string }
  execute(sql: string, params?: readonly SqlValue[]): Promise<{ rowsAffected: number }>
  query<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T[]>
  transaction<T>(fn: (tx: Pick<SqlDriver, 'execute' | 'query'>) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** Model download / warm-up progress, 0..1. */
export type ProgressListener = (progress: number) => void

/**
 * On-device text embeddings. Both platforms load the same ONNX artifact so vectors are
 * interchangeable across devices; `modelId` is stored next to every vector.
 */
export interface Embedder {
  readonly modelId: string
  readonly dimensions: number
  ready(onProgress?: ProgressListener): Promise<void>
  embed(texts: readonly string[], kind: 'passage' | 'query'): Promise<Float32Array[]>
  /** Frees the model (after its files were removed); the next use loads it again. */
  unload?(): void
}

export interface TranscriptionResult {
  text: string
  language: string
  durationMs: number
}

/**
 * Speech to text on the device (Whisper through transformers.js on both platforms): audio never
 * leaves the machine. The model downloads once, on first use.
 */
export interface Transcriber {
  readonly modelId: string
  /** Always true today; false would mean audio is sent to a server and the UI must say so. */
  readonly local: boolean
  ready(onProgress?: ProgressListener): Promise<void>
  /**
   * `language` fixes the language; otherwise it is detected among `languages` (the ones the
   * person speaks, default en, ru and es). `prefer` (the app's language, or the one spoken last)
   * wins unless detection clearly hears another one: short phrases are often misheard as English.
   */
  transcribe(
    audio: Blob,
    opts?: { language?: string; languages?: string[]; prefer?: string },
  ): Promise<TranscriptionResult>
  /** Switches the speech model (`SPEECH_MODELS`); it downloads on next use. Remembered. */
  setModel?(modelId: string): void
  /** Frees the model (after its files were removed); the next use loads it again. */
  unload?(): void
}

/**
 * Holds the Master Key. Desktop: OS keychain. Web: WebCrypto non-extractable wrapping key plus
 * IndexedDB. Raw key bytes never touch persistent storage in plain form on the web.
 */
export interface KeyStore {
  load(): Promise<Uint8Array | null>
  save(masterKey: Uint8Array): Promise<void>
  clear(): Promise<void>
}

/** Small secrets other than the account key (an LLM API key), kept like the account key. */
export interface SecretStore {
  get(name: string): Promise<string | null>
  set(name: string, value: string): Promise<void>
  delete(name: string): Promise<void>
}

/** Local attachment cache. Desktop: app-data dir. Web: OPFS. */
export interface BlobStore {
  put(key: string, data: Blob): Promise<void>
  get(key: string): Promise<Blob | null>
  delete(key: string): Promise<void>
}

/** Window buttons for a frameless desktop window. */
export interface WindowControls {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  /** Calls back on resize (maximize/restore change the icon). Returns an unsubscribe. */
  onResized(cb: () => void): Promise<() => void>
}

/**
 * How the window frame is drawn. `browser`: a tab, no frame. `custom`: frameless, the app draws
 * the caption buttons (Windows). `mac-overlay`: native traffic lights over the app's title bar.
 * `native`: the OS draws a regular title bar above the app (Linux).
 */
export type WindowChrome = 'browser' | 'custom' | 'mac-overlay' | 'native'

export interface PlatformCapabilities {
  /** Speech-to-text runs on the device. */
  localTranscription: boolean
  /** Notes never leave the device; sync and LLM proxy are off, LLM runs via Ollama. */
  localOnlyMode: boolean
  /** Local stdio MCP server over the same database. */
  localMcp: boolean
  /** System-wide hotkey and tray icon. */
  globalShortcut: boolean
}

export interface AvailableUpdate {
  version: string
  /** Release notes, if any. */
  notes: string | null
  /** Downloads and installs, reporting progress 0…1 when the size is known, then restarts. */
  install(onProgress?: (fraction: number | null) => void): Promise<void>
}

export interface AppUpdater {
  /**
   * This build's version, whether it can install updates (release builds are signed), and whether
   * a store installs them instead (the Microsoft Store build).
   */
  info(): Promise<{ version: string; enabled: boolean; store: boolean }>
  /** The newer version, or null when this one is the latest (or updates are not enabled). */
  check(): Promise<AvailableUpdate | null>
}

/**
 * Reads the text in an image on the device (OCR), so photos of pages, receipts and whiteboards
 * can be found by what they say. The language data downloads once, on first use.
 */
export interface TextRecognizer {
  readonly modelId: string
  ready(onProgress?: ProgressListener): Promise<void>
  /** The text found in the image ('' when there is none). */
  recognize(image: Blob): Promise<string>
  /** Frees the model (after its files were removed); the next use loads it again. */
  unload?(): void
}

/** A folder of Apple Notes (macOS), for the import. */
export interface AppleNotesFolder {
  id: string
  /** Its name and the names of the folders around it, outermost first. */
  path: string[]
  account: string
  count: number
  /** The account's default folder ("Notes"): its notes come in without a folder. */
  home: boolean
}

/** A note of Apple Notes as the Notes app gives it: HTML, with images inline as data URIs. */
export interface AppleNote {
  id: string
  title: string
  /** Empty for a locked note. */
  html: string
  created: number
  modified: number
  locked: boolean
  /** Attachments of the note (images, scans, files, drawings). */
  files: number
}

/**
 * Apple Notes on this Mac (desktop app on macOS only). Errors with "denied" when the user has not
 * let FixNote control Notes (System Settings → Privacy & Security → Automation).
 */
export interface AppleNotesSource {
  folders(): Promise<AppleNotesFolder[]>
  /** Notes `from`..`from + count` of a folder. */
  read(folderId: string, from: number, count: number): Promise<AppleNote[]>
}

/**
 * What the computer plays: the other people on a call, for call notes. Desktop only (Windows, and
 * macOS 14.2 or later). Nothing is stored; the audio is transcribed on the device like dictation.
 */
export interface SystemAudio {
  /** This computer can record what it plays (false on an older macOS). */
  supported(): Promise<boolean>
  /**
   * Starts recording; resolves once it runs. `onAudio` gets 16 kHz mono PCM as it comes, with
   * pauses kept (up to a second each); `onError` when recording stops on its own.
   */
  start(onAudio: (pcm: Float32Array) => void, onError: (message: string) => void): Promise<void>
  stop(): Promise<void>
}

/**
 * The desktop app's tray (menu bar) icon: closing the window hides the app there, and it quits
 * from the icon's menu, which asks first while a call is being recorded.
 */
export interface DesktopTray {
  /** The menu's labels in the app's language. */
  labels(open: string, quit: string): Promise<void>
  /** Quitting was asked for during a call; returns the unsubscribe. */
  onQuitRequested(cb: () => void): Promise<() => void>
  quit(): Promise<void>
}

/** The files of on-device models (`models.ts`), cached by the webview. */
export interface LocalModels {
  /** Bytes of the model's files on this device; 0 when it is not downloaded. */
  size(modelId: string): Promise<number>
  /** Removes the model's files; it downloads again when next needed. */
  remove(modelId: string): Promise<void>
}

export interface Platform {
  readonly kind: PlatformKind
  readonly chrome: WindowChrome
  readonly window?: WindowControls
  /** The app drew its first real frame: the desktop window, hidden until then, may appear. */
  readonly shown?: () => void
  readonly capabilities: PlatformCapabilities
  readonly sql: () => Promise<SqlDriver>
  readonly embedder: () => Promise<Embedder>
  readonly transcriber: () => Promise<Transcriber>
  readonly models?: LocalModels
  /** Apple Notes to import from (the desktop app on macOS). */
  readonly appleNotes?: AppleNotesSource
  /** The sound the computer plays, for call notes (the desktop app on Windows and macOS). */
  readonly systemAudio?: SystemAudio
  readonly tray?: DesktopTray
  /** Text from images, on the device (missing where it cannot run). */
  readonly ocr?: () => Promise<TextRecognizer>
  readonly keyStore: KeyStore
  readonly secrets: SecretStore
  /**
   * fetch without browser limits (CORS, plain-http localhost), streaming. Desktop only: used for
   * the user's own LLM endpoint and Ollama. The web app uses the browser's fetch.
   */
  readonly httpFetch?: typeof fetch
  readonly blobs: BlobStore
  /**
   * Reads a web page for a link card, from the device itself. Desktop only: browsers cannot read
   * other sites (CORS), so the web app goes through the `unfurl` edge function when signed in.
   */
  readonly fetchPage?: PageFetcher
  /**
   * The local MCP server shipped with the desktop app, and adding it to MCP clients' configs.
   * Absent on the web: a page cannot run a process for Claude Desktop to talk to.
   */
  readonly mcp?: {
    info(): Promise<{ command: string; built: boolean }>
    /** Adds FixNote to the client's config; resolves with the config file path. */
    connect(client: 'claude' | 'cursor' | 'codex'): Promise<string>
  }
  /**
   * Updates of the desktop app from signed releases. Absent on the web (it is always current) and
   * in builds without an update key.
   */
  readonly updater?: AppUpdater
  /** Opens a link in the system browser (desktop) or a new tab (web). */
  openExternal(url: string): Promise<void>
  /** Lets the user save a file. Desktop: native "Save as" dialog. Web: a download. */
  saveFile(name: string, data: Uint8Array, mime: string): Promise<'saved' | 'cancelled'>
}

/** Thrown by adapters for features scheduled in a later milestone. */
export class NotImplementedError extends Error {
  constructor(feature: string, milestone: string) {
    super(`${feature} is not implemented yet (planned for ${milestone})`)
    this.name = 'NotImplementedError'
  }
}
