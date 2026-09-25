const en = {
  app: {
    name: 'FixNote',
  },
  common: {
    cancel: 'Cancel',
    delete: 'Delete',
    rename: 'Rename',
    untitled: 'Untitled',
    undo: 'Undo',
    loading: 'Loading…',
    retry: 'Try again',
  },
  nav: {
    back: 'Back',
    forward: 'Forward',
  },
  sidebar: {
    search: 'Search',
    newNote: 'New note',
    inbox: 'Inbox',
    daily: 'Today',
    recents: 'All notes',
    folders: 'Folders',
    tags: 'Tags',
    noFolders: 'No folders yet. Notes land in Inbox and structure comes later.',
    noTags: 'Type #tag in a note to create one.',
    settings: 'Settings',
    collapse: 'Hide sidebar',
    expand: 'Show sidebar',
    newFolder: 'New folder',
    newSubfolder: 'New subfolder',
    folderName: 'Folder name',
    folderActions: 'Folder actions',
    deleteFolderTitle: 'Delete “{{name}}”?',
    deleteFolderBody: 'Notes inside move to Inbox. No note is deleted.',
  },
  home: {
    greeting: "What's on your mind?",
    filters: {
      all: 'All',
      inbox: 'Inbox',
      folder: 'Folder',
      allFolders: 'All folders',
      type: 'Type',
      allTypes: 'All types',
      notes: 'Notes',
      daily: 'Daily notes',
      period: 'Period',
      anyTime: 'Any time',
      today: 'Today',
      week: 'Last 7 days',
      month: 'Last 30 days',
    },
    empty: {
      title: 'No notes yet',
      body: 'Write or say anything below. It goes to Inbox; you can sort it out later, or never.',
    },
    emptyFiltered: 'Nothing matches these filters.',
  },
  list: {
    count: 'Notes: {{count}}',
    emptyFolder: 'This folder is empty. Move notes here from the note menu.',
    emptyTag: 'No notes with this tag.',
  },
  note: {
    placeholder: 'Start writing… Use # for headings, - [ ] for tasks, #tag for tags.',
    moveTo: 'Move to',
    delete: 'Delete note',
    deleted: 'Note deleted',
    edited: 'Edited {{time}}',
    notFound: 'This note no longer exists.',
    saving: 'Saving…',
    saved: 'Saved',
  },
  daily: {
    tasks: 'Tasks',
    notes: 'Notes',
  },
  quickInput: {
    placeholder: 'Write anything to get started…',
    save: 'Save to Inbox',
    ask: 'Ask',
    voice: 'Voice input',
    attach: 'Attach',
    hint: 'Enter to save · {{mod}}+Enter to ask',
    saved: 'Saved to Inbox',
  },
  spotlight: {
    placeholder: 'Search notes or type a command…',
    recents: 'Recent',
    results: 'Notes',
    commands: 'Commands',
    newNote: 'New note',
    today: "Open today's note",
    noResults: 'No notes found.',
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
  storage: {
    locked: 'FixNote is open in another tab. Changes in this tab will not be saved.',
    noOpfs: 'This browser cannot store notes offline. Changes will not be saved.',
    failed: 'Could not open the local database.',
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
