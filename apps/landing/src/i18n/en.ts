import type { Dict } from './index'

export const en: Dict = {
  meta: {
    siteName: 'FixNote',
    home: {
      title: 'FixNote — private notes with an assistant that remembers for you',
      description:
        'End-to-end encrypted notes for Windows, macOS and the web. Write or dictate, ask the assistant about your notes and get answers that cite their sources.',
    },
    features: {
      title: 'FixNote features: search in three languages, voice, assistant, Telegram, MCP',
      description:
        'Search that understands transliteration and synonyms, on-device dictation, an assistant for your notes, a daily note, import from Notion, Bear and Obsidian.',
    },
    security: {
      title: 'FixNote security: end-to-end encrypted notes',
      description:
        'How FixNote encrypts notes on your device, what the server stores, what the assistant sees and how to work fully offline.',
    },
    download: {
      title: 'Download FixNote for Windows and macOS',
      description:
        'FixNote installers for Windows and macOS (Apple Silicon and Intel), and a web version that runs right in your browser.',
    },
    blog: {
      title: 'FixNote blog: notes, memory and privacy',
      description:
        'How to keep notes you can find again, how end-to-end encryption works and how an assistant helps you remember.',
    },
    notFound: { title: 'Page not found · FixNote', description: 'This page does not exist.' },
  },

  nav: {
    home: 'Home',
    features: 'Features',
    security: 'Security',
    blog: 'Blog',
    download: 'Download',
    open: 'Open',
    skip: 'Skip to content',
    language: 'Language',
  },

  hero: {
    eyebrow: 'Private notes with an assistant',
    headline: [
      'Write it',
      { text: 'your way', tone: 'brand' },
      '\n',
      'Find it',
      { text: 'instantly', tone: 'blue' },
    ],
    lead: 'Type it, say it or send it on Telegram. Ask the assistant and it answers from your notes, citing the ones it used. Everything is encrypted on your device.',
    download: 'Download',
    downloadFor: { mac: 'Download for macOS', windows: 'Download for Windows' },
    openWeb: 'Open in browser',
    platforms: 'Windows · macOS · Web',
    shotAlt: 'FixNote: notes grouped by date and an assistant answering with links to notes',
  },

  story: {
    label: 'How thoughts get lost',
    lines: [
      { text: 'An idea came to you on the way.' },
      { text: 'You sent yourself a voice message on Telegram.', app: 'telegram' },
      { text: 'Then jotted a couple more thoughts on your phone.', emoji: '📱' },
      {
        text: 'A month later, you need it.',
        chip: { text: 'Where did I write that?', tone: 'blue', tilt: '-1.5deg' },
      },
      { text: 'You search for “sale”, but you wrote “discount”.', emoji: '🔍' },
      {
        text: 'You scroll through chats, folders and screenshots.',
        chip: { text: 'It was here somewhere…', tone: 'brand', tilt: '1.5deg' },
      },
    ],
    final: ['Notes should', { text: 'remember for you', tone: 'brand', after: '.' }],
  },

  how: {
    eyebrow: 'How it works',
    headline: ['Three steps', '\n', 'from thought to', { text: 'answer', tone: 'brand' }],
    lead: 'No folders, tags or rules to set up first. Tidy up later: the assistant will suggest how.',
    step: 'Step',
    steps: [
      {
        title: 'Capture it any way you like.',
        text: 'Type, dictate, or send the Telegram bot a message, voice note or photo. Speech is recognized right on your device.',
      },
      {
        title: 'Ask in your own words.',
        text: 'The assistant searches by meaning and by words in English, Spanish and Russian, and answers with links to the notes it drew from.',
      },
      {
        title: 'Tidy up in one click.',
        text: 'FixNote suggests titles, folders and tags and finds duplicates. Nothing changes until you accept, and every change can be undone.',
      },
    ],
    visual: {
      recording: 'Recording',
      done: 'Done',
      voice: 'Buy milk and call mom on Friday',
      telegram: 'Idea: a bot that sorts notes by itself',
      question: 'What did I decide about the vacation?',
      answer: 'July, by the sea: you picked Portugal and put off booking until payday.',
      sources: 'Sources',
      source1: 'Vacation 2026',
      source2: 'Summer ideas',
      tidyTitle: 'Tidy up',
      tidyMove: 'Move “Groceries” to the “Home” folder',
      tidyTitleSuggestion: 'Add a title: “Plan for the week”',
      tidyMerge: 'Merge two similar notes',
      accept: 'Accept',
    },
  },

  features: {
    eyebrow: 'Features',
    headline: ['More than', { text: 'notes', tone: 'brand' }],
    lead: 'Everything to capture fast and find even faster.',
    more: 'All features',
    cards: {
      search: {
        title: 'Search in three languages',
        text: '“telegram” finds “телеграм”, “giveaway” finds “розыгрыш”. Notes similar in meaning show up too.',
      },
      voice: {
        title: 'On-device voice',
        text: 'Dictate a thought and FixNote transcribes it locally. The recording never leaves your device.',
      },
      assistant: {
        title: 'Answers with sources',
        text: 'Answers come only from your notes, with numbered sources that are easy to check.',
      },
      daily: {
        title: 'Daily note',
        text: 'One note per day: carry yesterday’s unfinished tasks over with one click.',
      },
      telegram: {
        title: 'Telegram bot',
        text: 'Forward texts, voice notes and photos to the bot. It encrypts them with your key, so only your device can read them.',
      },
      mcp: {
        title: 'Claude and Cursor',
        text: 'A built-in MCP server: Claude Desktop and Cursor can search your notes and add to them if you allow it.',
      },
    },
  },

  securityTeaser: {
    eyebrow: 'Privacy',
    headline: ['The server sees', '\n', 'only', { text: 'ciphertext', tone: 'green' }],
    lead: 'Notes are encrypted on your device with a key you keep as 12 words. The key never leaves your devices, so not even we can read your notes.',
    points: [
      'Works without an account or internet',
      'Voice is recognized on your device',
      'The assistant gets only the passages it found',
      'Can run fully local, with Ollama',
    ],
    more: 'How we protect your notes',
    plain: 'Buy Anna a birthday present',
  },

  questions: {
    eyebrow: 'Example questions',
    headline: ['Ask', { text: 'your notes', tone: 'blue' }],
    lead: 'The way you would ask someone who has read everything you ever wrote down.',
    top: [
      'What did I decide about the vacation?',
      'Which books were recommended to me this year?',
      'What did we agree on in the meeting with Oleg?',
      'What gift ideas did I have for mom?',
      'What did I write about moving?',
      'What sneaker size did I wear last year?',
    ],
    bottom: [
      'Collect all my tasks for this week',
      'What did I learn about TypeScript this month?',
      'When did I last change the car’s oil?',
      'Which movies did I want to watch?',
      'What was in yesterday’s voice notes?',
      'Summarize my notes about the renovation',
    ],
  },

  download: {
    eyebrow: 'Download',
    headline: ['Your notes,', '\n', { text: 'everywhere', tone: 'brand' }],
    lead: 'Apps for Windows and macOS and a web version in your browser. Sync between devices is end-to-end encrypted.',
    windows: { name: 'Windows', detail: 'Windows 10 and 11, 64-bit', button: 'Download .exe' },
    macArm: {
      name: 'macOS · Apple Silicon',
      detail: 'Macs with M1 and later',
      button: 'Download .dmg',
    },
    macIntel: {
      name: 'macOS · Intel',
      detail: 'Macs with Intel processors',
      button: 'Download .dmg',
    },
    web: { name: 'Web', detail: 'Chrome, Edge, Safari, Firefox', button: 'Open' },
    macNoteTitle: 'First launch on a Mac',
    macNote:
      'Until the app is notarized by Apple, macOS may say it is damaged. Drag FixNote to Applications and run this once in Terminal:',
    windowsNoteTitle: 'First launch on Windows',
    windowsNote:
      'Windows may show a SmartScreen warning: click “More info” and then “Run anyway”. A signed installer is coming later.',
  },

  faq: {
    eyebrow: 'FAQ',
    headline: ['Questions', '\n', 'and', { text: 'answers', tone: 'blue' }],
    items: [
      {
        q: 'Do I need an account?',
        a: 'No. FixNote works on your device without signing up and without internet. An account is only needed to sync between devices, for FixNote AI and for sharing links to notes.',
      },
      {
        q: 'Who can read my notes?',
        a: 'Only you. Notes are encrypted on your device with a key that stays with you: in your system keychain and in your 12-word recovery phrase. The server stores only ciphertext.',
      },
      {
        q: 'What does the assistant see?',
        a: 'Only the passages found for a particular question, never your whole library. You can plug in your own OpenAI, OpenRouter, Groq or DeepSeek key, or Ollama on your computer, and then nothing goes online.',
      },
      {
        q: 'What if I lose my 12-word phrase?',
        a: 'Devices where you are already signed in keep your notes, and from there you can add a new device without the phrase. If you lose both the phrase and every device, no one can recover the notes, including us.',
      },
      {
        q: 'Can I move my notes from Notion, Bear or Obsidian?',
        a: 'Yes. Import understands a Markdown folder (Obsidian too), a Bear backup and a Notion export, and keeps folders, tags, dates and images. You can export everything back to Markdown at any time.',
      },
      {
        q: 'Which languages does FixNote support?',
        a: 'The app is in English, Spanish and Russian. Search and the assistant understand notes that mix these languages, including transliteration and slang.',
      },
    ],
  },

  blogTeaser: {
    eyebrow: 'Blog',
    headline: ['On', { text: 'memory', tone: 'green' }, 'and notes'],
    all: 'All articles',
  },

  cta: {
    title: 'Write down your first thought',
    lead: 'Download FixNote or open it right in your browser.',
    download: 'Download',
    open: 'Open in browser',
  },

  footer: {
    tagline: 'Private notes with an assistant that remembers for you.',
    product: 'Product',
    resources: 'Resources',
    webApp: 'Web app',
    rss: 'RSS',
    rights: 'FixNote',
  },

  featuresPage: {
    eyebrow: 'Features',
    headline: ['Everything your', '\n', { text: 'memory', tone: 'brand' }, 'needs'],
    lead: 'FixNote gathers thoughts from anywhere and helps you find them when they matter.',
    sections: [
      {
        id: 'search',
        title: 'Search that knows what you meant',
        text: 'Search finds words typed in any keyboard layout and in transliteration: “telegram” finds “телеграм”. The assistant adds translations and synonyms to your query, so “giveaways” finds a note about a “розыгрыш”. And when no words match at all, FixNote shows notes that are similar in meaning.',
        points: [
          'English, Spanish and Russian, mixed',
          'Matches highlighted in the text',
          'Mod+K from anywhere',
        ],
      },
      {
        id: 'assistant',
        title: 'An assistant that answers from your notes',
        text: 'Ask “what did I decide about the vacation?” and the assistant finds the right notes and answers with numbered sources. Its context follows what you have open: one note, a folder or everything.',
        points: [
          'Answers link to your notes',
          'FixNote AI, your own key or Ollama',
          'Only the passages it found are sent',
        ],
      },
      {
        id: 'voice',
        title: 'Voice that stays on your device',
        text: 'Dictate a new note, the rest of an open one, or a question for the assistant. Recognition (Whisper) runs on your computer; the model downloads once.',
        points: ['Shortcut Mod+Shift+Space', 'Works offline', 'Can add to your daily note'],
      },
      {
        id: 'edit',
        title: 'AI edits only when you say so',
        text: 'Select text and ask to shorten, rewrite, fix mistakes or tidy up a messy dump. Changes show word by word: accept or reject them. Every AI edit is listed in settings and can be undone.',
        points: ['Word-by-word before and after', 'One step to undo', 'History of AI edits'],
      },
      {
        id: 'daily',
        title: 'A daily note and effortless order',
        text: 'A daily note with tasks and day-to-day navigation: carry yesterday’s unfinished tasks over with one click. Every few days, “Tidy up” suggests titles, folders and tags and merges duplicates.',
        points: [
          'Carry over tasks, with confirmation',
          'Notes grouped by date',
          'Everything can be undone',
        ],
      },
      {
        id: 'capture',
        title: 'Telegram, images and links',
        text: 'Send the Telegram bot a message, voice note or photo and it becomes a note. A pasted link turns into a card with its title and image; images are compressed and synced encrypted.',
        points: ['Voice notes transcribed on your device', 'Link cards', 'Images up to 20 MB'],
      },
      {
        id: 'mcp',
        title: 'Claude, Cursor and other MCP clients',
        text: 'The desktop app includes a local MCP server. Connect it to Claude Desktop or Cursor in one click and they can search and read your notes, and with your permission create new ones.',
        points: ['Read-only by default', 'Works on the local database', 'One-click setup'],
      },
      {
        id: 'import',
        title: 'Move in, and leave any time',
        text: 'Import a Markdown or Obsidian folder, Bear or Notion with folders, tags, dates and images. Export all notes to Markdown whenever you like: your data belongs to you.',
        points: [
          'Notion, Bear, Obsidian, Markdown',
          'Re-import without duplicates',
          'Export to Markdown',
        ],
      },
    ],
  },

  securityPage: {
    eyebrow: 'Security',
    headline: ['Your notes are', '\n', 'readable only by', { text: 'you', tone: 'green' }],
    lead: 'FixNote is built so that you don’t have to trust us: encryption happens on your device, and the server stores only what it cannot read.',
    sections: [
      {
        title: 'Encrypted on your device',
        text: 'When you create an account, FixNote generates a random key and shows it to you as 12 words. Every note is encrypted on the device (XChaCha20-Poly1305) with a fresh key, wrapped with your account key. The ciphertext is bound to its note, so the server cannot swap one note for another.',
      },
      {
        title: 'What the server stores',
        text: 'Encrypted notes, folders and attachments, what sync needs to line devices up (version numbers, created and edited dates, which note is a daily note), and your email address for sign-in codes. Note text, folder names and images are never on the server in readable form.',
      },
      {
        title: 'What the assistant sees',
        text: 'Searching your notes happens on your device. Only the passages found for your question are sent to the language model. Choose FixNote AI, your own key (OpenAI, OpenRouter, Groq, DeepSeek) or Ollama on your computer, and then nothing goes online.',
      },
      {
        title: 'Voice and Telegram',
        text: 'Speech is recognized by a Whisper model right on your device. The Telegram bot never stores messages in readable form: it seals them with your public key at once, and only your app can open them.',
      },
      {
        title: 'A new device without typing the phrase',
        text: 'You can add a new device from one where you are already signed in: both screens show the same six-digit code, and the key goes only to the new device, encrypted.',
      },
      {
        title: 'Links to notes',
        text: 'When you share a note, the copy is encrypted with a key that lives only in the part of the link after “#”. Browsers never send that part to a server, so the server stores a copy it cannot read. You can turn the link off at any time.',
      },
      {
        title: 'Fully local',
        text: 'FixNote works without an account and without internet. Local-only mode turns off sync, Telegram and links, and the assistant uses only Ollama on your computer.',
      },
    ],
    stored: 'What the server stores for a note',
  },

  downloadPage: {
    eyebrow: 'Download',
    headline: ['FixNote for', { text: 'your', tone: 'brand' }, 'devices'],
    lead: 'Pick the installer for your system or open the web version. Once you sign in, notes sync between all your devices.',
    requirementsTitle: 'System requirements',
    requirements: [
      'Windows 10 or 11 (64-bit); WebView2 installs automatically',
      'macOS 11 Big Sur or later',
      'For dictation: about 80 MB for the speech model',
      'For search by meaning: about 120 MB for the language model',
    ],
  },

  blogPage: {
    eyebrow: 'Blog',
    headline: ['Notes', { text: 'about notes', tone: 'brand' }],
    lead: 'How to write thoughts down so you can find them later, and how FixNote works inside.',
    read: 'Read',
    minutes: 'min',
    back: 'All articles',
    published: 'Published',
    empty: 'Articles are coming soon.',
    otherLanguages: 'This article in other languages',
  },

  notFound: {
    title: 'This page does not exist',
    text: 'The link may be outdated. Start from the home page.',
    home: 'Home',
  },
}
