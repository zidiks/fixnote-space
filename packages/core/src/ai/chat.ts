import type { SqlDriver, SqlRow } from '../platform'
import type { ChatScope } from './scope'

export type ChatMessageKind = 'user' | 'assistant' | 'divider'
export type ChatStatus = 'streaming' | 'done' | 'stopped' | 'error'

export interface StoredCitation {
  n: number
  noteId: string
  title: string
  quote: string
}

/** A question asked by voice: the recording on this device and what its player draws. */
export interface VoiceClip {
  /** BlobStore key of the recording. */
  key: string
  durationMs: number
  /** Loudness over time, 0..1, a few dozen values for the waveform. */
  peaks: number[]
}

/** Where a voice message's recording is kept (BlobStore). */
export const voiceBlobKey = (id: string) => `voice/${id}`

/** A change the assistant made while answering: its AI activity log entry and what it did. */
export interface ChatAction {
  id: string
  label: string
}

/** The changes of one answer; `undone` once the user took them all back. */
export interface ChatActions {
  items: ChatAction[]
  undone: boolean
}

/** What the start of a long thread was about, once it no longer fits the model (kv). */
export const CHAT_SUMMARY_KEY = 'chat.summary'

export interface ChatSummary {
  text: string
  /** Entries up to this time are in the summary. */
  upTo: number
}

export interface ChatEntry {
  id: string
  kind: ChatMessageKind
  content: string
  /** Asked by voice: the recording (content is its transcript). */
  voice?: VoiceClip | null
  scope: ChatScope
  citations: StoredCitation[]
  confidence: 'high' | 'medium' | 'low' | null
  status: ChatStatus | null
  /** Changes the assistant made in this answer. */
  actions?: ChatActions | null
  createdAt: number
}

interface Row extends SqlRow {
  id: string
  kind: string
  content: string
  scope: string
  citations: string | null
  status: string | null
  voice: string | null
  actions: string | null
  created_at: number
}

const toEntry = (r: Row): ChatEntry => {
  const extra = r.citations
    ? (JSON.parse(r.citations) as { items: StoredCitation[]; confidence: ChatEntry['confidence'] })
    : null
  return {
    id: r.id,
    kind: r.kind as ChatMessageKind,
    content: r.content,
    scope: JSON.parse(r.scope) as ChatScope,
    citations: extra?.items ?? [],
    confidence: extra?.confidence ?? null,
    status: (r.status as ChatStatus | null) ?? null,
    voice: r.voice ? (JSON.parse(r.voice) as VoiceClip) : null,
    actions: r.actions ? (JSON.parse(r.actions) as ChatActions) : null,
    createdAt: Number(r.created_at),
  }
}

/** The single assistant thread, kept on this device. */
export class ChatRepo {
  constructor(
    private readonly db: SqlDriver,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  /** The latest `limit` entries, oldest first. */
  async recent(limit = 200): Promise<ChatEntry[]> {
    const rows = await this.db.query<Row>(
      `SELECT * FROM (SELECT rowid AS seq, * FROM chat_messages ORDER BY created_at DESC, seq DESC LIMIT ?)
        ORDER BY created_at, seq`,
      [limit],
    )
    return rows.map(toEntry)
  }

  async add(
    entry: Pick<ChatEntry, 'kind' | 'content' | 'scope'> & Partial<ChatEntry>,
  ): Promise<ChatEntry> {
    const full: ChatEntry = {
      id: entry.id ?? this.newId(),
      kind: entry.kind,
      content: entry.content,
      scope: entry.scope,
      citations: entry.citations ?? [],
      confidence: entry.confidence ?? null,
      status: entry.status ?? null,
      voice: entry.voice ?? null,
      createdAt: entry.createdAt ?? this.now(),
    }
    await this.db.execute(
      'INSERT INTO chat_messages (id, kind, content, scope, citations, status, created_at, voice) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        full.id,
        full.kind,
        full.content,
        JSON.stringify(full.scope),
        full.citations.length || full.confidence
          ? JSON.stringify({ items: full.citations, confidence: full.confidence })
          : null,
        full.status,
        full.createdAt,
        full.voice ? JSON.stringify(full.voice) : null,
      ],
    )
    return full
  }

  async finish(
    id: string,
    patch: {
      content: string
      status: ChatStatus
      citations?: StoredCitation[]
      confidence?: ChatEntry['confidence']
    },
  ): Promise<void> {
    await this.db.execute(
      'UPDATE chat_messages SET content = ?, status = ?, citations = ? WHERE id = ?',
      [
        patch.content,
        patch.status,
        patch.citations?.length || patch.confidence
          ? JSON.stringify({ items: patch.citations ?? [], confidence: patch.confidence ?? null })
          : null,
        id,
      ],
    )
  }

  async setActions(id: string, actions: ChatActions | null): Promise<void> {
    await this.db.execute('UPDATE chat_messages SET actions = ? WHERE id = ?', [
      actions?.items.length ? JSON.stringify(actions) : null,
      id,
    ])
  }

  async summary(): Promise<ChatSummary | null> {
    const [row] = await this.db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?', [
      CHAT_SUMMARY_KEY,
    ])
    try {
      return row ? (JSON.parse(row.value) as ChatSummary) : null
    } catch {
      return null
    }
  }

  async setSummary(summary: ChatSummary): Promise<void> {
    await this.db.execute(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [CHAT_SUMMARY_KEY, JSON.stringify(summary)],
    )
  }

  /** Empties the thread; returns the BlobStore keys of its recordings, for the caller to remove. */
  async clear(): Promise<string[]> {
    const keys = await voiceKeys(this.db)
    await this.db.execute('DELETE FROM chat_messages')
    await this.db.execute('DELETE FROM kv WHERE key = ?', [CHAT_SUMMARY_KEY])
    return keys
  }
}

/** BlobStore keys of every voice message's recording. */
export async function voiceKeys(db: Pick<SqlDriver, 'query'>): Promise<string[]> {
  const rows = await db.query<{ voice: string }>(
    'SELECT voice FROM chat_messages WHERE voice IS NOT NULL',
  )
  return rows.map((r) => (JSON.parse(r.voice) as VoiceClip).key)
}
