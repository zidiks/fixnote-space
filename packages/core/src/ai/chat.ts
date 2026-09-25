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

export interface ChatEntry {
  id: string
  kind: ChatMessageKind
  content: string
  scope: ChatScope
  citations: StoredCitation[]
  confidence: 'high' | 'medium' | 'low' | null
  status: ChatStatus | null
  createdAt: number
}

interface Row extends SqlRow {
  id: string
  kind: string
  content: string
  scope: string
  citations: string | null
  status: string | null
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
      createdAt: entry.createdAt ?? this.now(),
    }
    await this.db.execute(
      'INSERT INTO chat_messages (id, kind, content, scope, citations, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
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

  async clear(): Promise<void> {
    await this.db.execute('DELETE FROM chat_messages')
  }
}
