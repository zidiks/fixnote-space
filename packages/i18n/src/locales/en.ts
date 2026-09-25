const en = {
  app: {
    name: 'FixNote',
  },
  sidebar: {
    search: 'Search',
    newNote: 'New note',
    inbox: 'Inbox',
    daily: 'Today',
    recents: 'Recents',
    folders: 'Folders',
    tags: 'Tags',
    noFolders: 'No folders yet. Notes land in Inbox and structure comes later.',
    noTags: 'Type #tag in a note to create one.',
    settings: 'Settings',
    collapse: 'Hide sidebar',
    expand: 'Show sidebar',
  },
  home: {
    greeting: "What's on your mind?",
    filters: {
      all: 'All',
      inbox: 'Inbox',
      folder: 'Folder',
      type: 'Type',
      period: 'Period',
    },
    empty: {
      title: 'No notes yet',
      body: 'Write or say anything below. It goes to Inbox; you can sort it out later, or never.',
    },
  },
  quickInput: {
    placeholder: 'Write anything to get started…',
    save: 'Save to Inbox',
    ask: 'Ask',
    voice: 'Voice input',
    attach: 'Attach',
    hint: 'Enter to save · {{mod}}+Enter to ask',
  },
  chat: {
    title: 'Assistant',
    open: 'Open assistant',
    close: 'Close assistant',
    scope: {
      label: 'Context',
      all: 'All notes',
      folder: 'Folder: {{name}}',
      note: 'Note: {{name}}',
      selection: 'Selection in {{name}}',
    },
    scopeChanged: 'Now in context: {{scope}}',
    placeholder: 'Ask about your notes…',
    empty: 'Ask anything. Answers cite the notes they come from.',
  },
  settings: {
    language: 'Language',
    theme: 'Theme',
    themes: {
      system: 'System',
      light: 'Light',
      dark: 'Dark',
    },
  },
  status: {
    offline: 'Offline',
    notConfigured: 'Cloud sync not configured',
  },
} as const

export default en

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> }

/** Shape every locale must match: same keys as English, any strings. */
export type LocaleResource = Widen<typeof en>
