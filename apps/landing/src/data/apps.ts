/**
 * FixNote next to the note apps people most often weigh it against: what each one does, as their
 * own pricing and help pages describe it (checked October 2026). The words for every row live in
 * the i18n files (`compare.rows`); this file holds only the facts, the same in every language.
 * When a vendor changes a plan, change it here and in the "best apps" articles.
 */
export type Mark = 'yes' | 'part' | 'no'

export const ROWS = [
  'free',
  'noAccount',
  'windows',
  'web',
  'e2ee',
  'assistant',
  'ownModel',
  'dictation',
  'calls',
  'telegram',
  'mcp',
] as const
export type Row = (typeof ROWS)[number]

export const RIVALS = ['notion', 'obsidian', 'evernote', 'apple-notes', 'joplin'] as const
export type Rival = (typeof RIVALS)[number]
export type AppId = 'fixnote' | Rival

export interface App {
  name: string
  /** The cheapest paid plan, per month when paid monthly; null when there is none. */
  paid: string | null
  /** The vendor's site, for the footnote. */
  site: string
  marks: Record<Row, Mark>
}

export const APPS: Record<AppId, App> = {
  fixnote: {
    name: 'FixNote',
    paid: '$7',
    site: 'fixnote.space',
    marks: {
      free: 'yes',
      noAccount: 'yes',
      windows: 'yes',
      web: 'yes',
      e2ee: 'yes',
      assistant: 'yes',
      ownModel: 'yes',
      dictation: 'yes',
      calls: 'yes',
      telegram: 'yes',
      mcp: 'yes',
    },
  },
  notion: {
    name: 'Notion',
    paid: '$10',
    site: 'notion.com',
    marks: {
      free: 'yes',
      noAccount: 'no',
      windows: 'yes',
      web: 'yes',
      e2ee: 'no',
      // Notion AI (Agent, Enterprise Search) comes with Business; Free and Plus get a trial.
      assistant: 'yes',
      ownModel: 'no',
      dictation: 'no',
      // AI Meeting Notes, Business plan, desktop app.
      calls: 'yes',
      telegram: 'no',
      // Hosted server at mcp.notion.com.
      mcp: 'yes',
    },
  },
  obsidian: {
    name: 'Obsidian',
    paid: '$5',
    site: 'obsidian.md',
    marks: {
      free: 'yes',
      noAccount: 'yes',
      windows: 'yes',
      web: 'no',
      // Obsidian Sync (paid) encrypts end to end; the app itself keeps plain files on the disk.
      e2ee: 'yes',
      assistant: 'no',
      ownModel: 'no',
      dictation: 'no',
      calls: 'no',
      telegram: 'no',
      mcp: 'no',
    },
  },
  evernote: {
    name: 'Evernote',
    paid: '$14.99',
    site: 'evernote.com',
    marks: {
      // Free keeps 50 notes in one notebook on one device.
      free: 'part',
      noAccount: 'no',
      windows: 'yes',
      web: 'yes',
      // Only text you select and lock with a passphrase; synced notes are not end-to-end encrypted.
      e2ee: 'no',
      // AI Assistant answers across notebooks on paid plans.
      assistant: 'yes',
      ownModel: 'no',
      // AI Transcribe runs in the cloud.
      dictation: 'no',
      // AI Transcribe records a meeting and writes its summary and transcript.
      calls: 'yes',
      telegram: 'no',
      // Official MCP server (beta).
      mcp: 'yes',
    },
  },
  'apple-notes': {
    name: 'Apple Notes',
    paid: null,
    site: 'apple.com',
    marks: {
      free: 'yes',
      // Notes "On My Mac" or "On My iPhone" need no Apple Account; they then stay on that device.
      noAccount: 'part',
      windows: 'no',
      // iCloud.com in a browser.
      web: 'yes',
      // With Advanced Data Protection, which is off until you turn it on.
      e2ee: 'part',
      assistant: 'no',
      ownModel: 'no',
      dictation: 'yes',
      // Phone and FaceTime calls recorded into Notes with a transcript and an Apple Intelligence summary.
      calls: 'yes',
      telegram: 'no',
      mcp: 'no',
    },
  },
  joplin: {
    name: 'Joplin',
    paid: '€2.99',
    site: 'joplinapp.org',
    marks: {
      free: 'yes',
      noAccount: 'yes',
      windows: 'yes',
      // The Joplin Cloud web app.
      web: 'part',
      e2ee: 'yes',
      // Joplin 3.7 chat answers about the open note.
      assistant: 'part',
      ownModel: 'yes',
      // Voice typing on Android only.
      dictation: 'part',
      calls: 'no',
      telegram: 'no',
      // Built-in MCP server in the desktop app, off until you turn it on.
      mcp: 'yes',
    },
  },
}
