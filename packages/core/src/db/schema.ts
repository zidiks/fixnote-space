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
