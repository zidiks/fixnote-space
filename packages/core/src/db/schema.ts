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
  /* 7: pinned notes. pinned_at = when it was pinned (NULL = not pinned); pin_updated_at = when the
     pin was last set or cleared, so sync keeps the latest pin change even if the text was edited
     elsewhere in between. */ `
  ALTER TABLE notes ADD COLUMN pinned_at INTEGER;
  ALTER TABLE notes ADD COLUMN pin_updated_at INTEGER;
  `,
  /* 8: folder changes in the AI activity log (MCP clients can create, rename and delete folders),
     JSON like `changes`, so they can be undone too. */ `
  ALTER TABLE ai_actions ADD COLUMN folder_changes TEXT;
  `,
  /* 9: sync conflicts this device saw: a note edited in the same place on two devices keeps one
     version, the other becomes a copy. Local only; the UI offers to compare and settle them. */ `
  CREATE TABLE sync_conflicts (
    copy_id     TEXT PRIMARY KEY,
    note_id     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  `,
  /* 10: notes shared with other people. notes.shared_id links a local note to its shared note; such
     notes sync through shared_docs (a Yjs document per note), not through the personal sync.
     note_key is the shared note's key (the local database is not encrypted anyway); projected is
     the Markdown last written from the document, to notice edits made outside the editor (MCP, AI,
     Telegram) and bring them into the document. */ `
  ALTER TABLE notes ADD COLUMN shared_id TEXT;
  CREATE TABLE shared_docs (
    shared_id       TEXT PRIMARY KEY,
    note_id         TEXT NOT NULL,
    role            TEXT NOT NULL,
    note_key        TEXT NOT NULL,
    state           BLOB,
    server_version  INTEGER NOT NULL DEFAULT 0,
    dirty           INTEGER NOT NULL DEFAULT 0,
    projected       TEXT
  );
  `,
  // 11: shared folders. A member's copy of someone's folder is a local folder with `shared_id`
  // (kept out of the personal sync); `shared_folders` holds the folder key and role, for the
  // owner too. A shared note that came through a folder remembers which one.
  `
  ALTER TABLE folders ADD COLUMN shared_id TEXT;
  CREATE TABLE shared_folders (
    shared_id   TEXT PRIMARY KEY,
    folder_id   TEXT NOT NULL,
    role        TEXT NOT NULL,
    folder_key  TEXT NOT NULL,
    owner_id    TEXT NOT NULL,
    name        TEXT
  );
  ALTER TABLE shared_docs ADD COLUMN folder_shared_id TEXT;
  ALTER TABLE shared_docs ADD COLUMN created_by TEXT;
  `,
  // 12: when the text last changed. \`updated_at\` moves with any change (a move, a delete) because
  // sync settles those by it; what the app shows and sorts by is \`edited_at\`, which only a change
  // of the text moves. Kept by triggers, so every writer (repo, sync, shared notes) gets it right.
  `
  ALTER TABLE notes ADD COLUMN edited_at INTEGER;
  UPDATE notes SET edited_at = updated_at;
  CREATE INDEX notes_edited ON notes(edited_at DESC, id DESC) WHERE deleted_at IS NULL;
  CREATE TRIGGER notes_edited_insert AFTER INSERT ON notes WHEN NEW.edited_at IS NULL
  BEGIN
    UPDATE notes SET edited_at = NEW.updated_at WHERE id = NEW.id;
  END;
  CREATE TRIGGER notes_edited_content AFTER UPDATE OF content ON notes
    WHEN NEW.content IS NOT OLD.content
  BEGIN
    UPDATE notes SET edited_at = NEW.updated_at WHERE id = NEW.id;
  END;
  `,
  // 13: a shared folder's layout (its subfolders and where each note is), a Yjs document like a
  // shared note's; \`layout_projected\` is the layout as last applied here, so changes made here
  // (a new subfolder, a note moved) can be told from the others'.
  `
  ALTER TABLE shared_folders ADD COLUMN layout BLOB;
  ALTER TABLE shared_folders ADD COLUMN layout_version INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE shared_folders ADD COLUMN layout_dirty INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE shared_folders ADD COLUMN layout_projected TEXT;
  `,
  // 14: no tags any more (#words in a note are plain text); tidy stops suggesting them.
  `
  DROP TABLE note_tags;
  DROP TABLE tags;
  DELETE FROM tidy_suggestions WHERE kind = 'tag';
  `,
  // 15: files of shared notes already on the server under the note (sealed with its key), so each
  // is uploaded once for everyone.
  `
  CREATE TABLE shared_files (
    shared_id     TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    PRIMARY KEY (shared_id, attachment_id)
  );
  `,
  // 16: voice messages to the assistant. The recording stays on this device (BlobStore, key in
  // the JSON); the message's content is its transcript.
  `
  ALTER TABLE chat_messages ADD COLUMN voice TEXT;
  `,
  // 17: what the assistant changed while answering (AI activity log ids, for Undo all).
  `
  ALTER TABLE chat_messages ADD COLUMN actions TEXT;
  `,
  // 18: text read from images on this device (OCR), searchable with the notes that show them.
  // Each device reads its own copies; an empty text means the image has none (not tried again).
  `
  CREATE TABLE image_text (
    attachment_id TEXT PRIMARY KEY,
    text          TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE VIRTUAL TABLE image_text_fts USING fts5(
    text,
    content = 'image_text', content_rowid = 'rowid',
    tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER image_text_insert AFTER INSERT ON image_text BEGIN
    INSERT INTO image_text_fts(rowid, text) VALUES (new.rowid, new.text);
  END;
  CREATE TRIGGER image_text_delete AFTER DELETE ON image_text BEGIN
    INSERT INTO image_text_fts(image_text_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  END;
  CREATE TRIGGER image_text_update AFTER UPDATE OF text ON image_text BEGIN
    INSERT INTO image_text_fts(image_text_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
    INSERT INTO image_text_fts(rowid, text) VALUES (new.rowid, new.text);
  END;
  `,
  // 19: sync brings each note's `edited_at` from the device that changed the text and sets it with
  // the text; the trigger only fills it in when a writer leaves it as it was.
  `
  DROP TRIGGER notes_edited_content;
  CREATE TRIGGER notes_edited_content AFTER UPDATE OF content ON notes
    WHEN NEW.content IS NOT OLD.content AND NEW.edited_at IS OLD.edited_at
  BEGIN
    UPDATE notes SET edited_at = NEW.updated_at WHERE id = NEW.id;
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
