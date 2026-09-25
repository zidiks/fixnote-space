/**
 * Local database schema, identical on desktop (rusqlite) and web (sqlite-wasm).
 * Append new migrations; never edit a shipped one. `PRAGMA user_version` = number applied.
 */
export const MIGRATIONS: readonly string[] = [
  /* 1: notes, folders, tags, full-text search */ `
  CREATE TABLE folders (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES folders(id),
    name        TEXT NOT NULL,
    sort        REAL NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
  );

  CREATE TABLE notes (
    id          TEXT PRIMARY KEY,
    folder_id   TEXT REFERENCES folders(id),
    type        TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'daily')),
    daily_date  TEXT,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    -- Markdown stripped to plain text: what search indexes and snippets show.
    search_text TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
  );
  CREATE UNIQUE INDEX notes_daily_date ON notes(daily_date)
    WHERE daily_date IS NOT NULL AND deleted_at IS NULL;
  CREATE INDEX notes_recent ON notes(updated_at DESC, id DESC) WHERE deleted_at IS NULL;
  CREATE INDEX notes_folder ON notes(folder_id, updated_at DESC) WHERE deleted_at IS NULL;

  CREATE TABLE tags (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE
  );
  CREATE TABLE note_tags (
    note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  ) WITHOUT ROWID;
  CREATE INDEX note_tags_tag ON note_tags(tag_id);

  CREATE VIRTUAL TABLE notes_fts USING fts5(
    title, search_text,
    content = 'notes', content_rowid = 'rowid',
    tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, search_text) VALUES (new.rowid, new.title, new.search_text);
  END;
  CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, search_text)
      VALUES ('delete', old.rowid, old.title, old.search_text);
  END;
  CREATE TRIGGER notes_fts_update AFTER UPDATE OF title, search_text ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, search_text)
      VALUES ('delete', old.rowid, old.title, old.search_text);
    INSERT INTO notes_fts(rowid, title, search_text) VALUES (new.rowid, new.title, new.search_text);
  END;
  `,
  /* 2: sync bookkeeping. dirty = has local changes not yet pushed; local_rev counts local edits so a
     push only clears dirty if nothing changed meanwhile; base_content = content at last sync, the
     common ancestor for three-way merges. */ `
  ALTER TABLE notes ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE notes ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE notes ADD COLUMN local_rev INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE notes ADD COLUMN base_content TEXT;
  CREATE INDEX notes_dirty ON notes(dirty) WHERE dirty = 1;

  ALTER TABLE folders ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE folders ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE folders ADD COLUMN local_rev INTEGER NOT NULL DEFAULT 1;
  CREATE INDEX folders_dirty ON folders(dirty) WHERE dirty = 1;

  CREATE TABLE kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  /* 3: assistant. chunks = embedded passages of each note (local only, recomputed per device);
     indexed_at/indexed_hash tell the indexer what is stale; chat_messages = the single thread. */ `
  CREATE TABLE chunks (
    note_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    ord       INTEGER NOT NULL,
    text      TEXT NOT NULL,
    model     TEXT NOT NULL,
    embedding BLOB NOT NULL,
    PRIMARY KEY (note_id, ord)
  ) WITHOUT ROWID;

  ALTER TABLE notes ADD COLUMN indexed_at INTEGER;
  ALTER TABLE notes ADD COLUMN indexed_hash TEXT;

  CREATE TABLE chat_messages (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('user', 'assistant', 'divider')),
    content    TEXT NOT NULL,
    scope      TEXT NOT NULL,
    citations  TEXT,
    status     TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX chat_messages_created ON chat_messages(created_at);
  `,
  /* 4: link cards. Page metadata per URL, fetched on the device (or through our proxy on the web)
     and kept locally; not synced, every device fetches what it shows. */ `
  CREATE TABLE link_previews (
    url         TEXT PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('page', 'image', 'video', 'none')),
    title       TEXT,
    description TEXT,
    image       TEXT,
    site        TEXT,
    fetched_at  INTEGER NOT NULL
  ) WITHOUT ROWID;
  `,
  /* 5: attachments (images in notes). Bytes live in the platform BlobStore under "att/<id>";
     Markdown refers to them as attachment:<id>. uploaded = 1 once the encrypted copy is on the
     server. */ `
  CREATE TABLE attachments (
    id          TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    uploaded    INTEGER NOT NULL DEFAULT 0
  ) WITHOUT ROWID;
  `,
  /* 6: control over AI. ai_actions = what the AI (or an MCP client) changed, with the note states
     before and after, so it can be undone; tidy_suggestions = proposals waiting for a decision.
     Both are local to the device. */ `
  CREATE TABLE ai_actions (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    summary     TEXT NOT NULL,
    provider    TEXT NOT NULL,
    changes     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    undone_at   INTEGER
  ) WITHOUT ROWID;
  CREATE INDEX ai_actions_recent ON ai_actions(created_at DESC);

  CREATE TABLE tidy_suggestions (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('move', 'tag', 'title', 'merge')),
    note_id     TEXT NOT NULL,
    payload     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX tidy_pending ON tidy_suggestions(status, created_at);
  `,
]

/** Splits a migration into statements, keeping trigger bodies (BEGIN … END;) whole. */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let depth = 0
  for (const line of sql.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('--')) continue
    current += `${line}\n`
    if (/\bBEGIN\s*$/i.test(trimmed)) depth++
    if (/^END;$/i.test(trimmed)) depth--
    if (depth === 0 && trimmed.endsWith(';')) {
      out.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) out.push(current.trim())
  return out
}
