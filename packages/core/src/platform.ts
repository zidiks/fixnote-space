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
  transcribe(audio: Blob, opts?: { language?: string }): Promise<TranscriptionResult>
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

export interface Platform {
  readonly kind: PlatformKind
  readonly chrome: WindowChrome
  readonly window?: WindowControls
  readonly capabilities: PlatformCapabilities
  readonly sql: () => Promise<SqlDriver>
  readonly embedder: () => Promise<Embedder>
  readonly transcriber: () => Promise<Transcriber>
  readonly keyStore: KeyStore
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
    connect(client: 'claude' | 'cursor'): Promise<string>
  }
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
