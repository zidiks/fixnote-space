import type { Dict } from './index'

export const en: Dict = {
  meta: {
    siteName: 'FixNote',
    home: {
      title: 'FixNote: private notes with an assistant that remembers for you',
      description:
        'End-to-end encrypted notes for Windows, macOS and the web. Write or dictate, ask the assistant about your notes and get answers that cite their sources.',
    },
    features: {
      title: 'FixNote features: AI assistant, voice notes, search and encryption',
      description:
        'Everything FixNote does: an assistant that answers from your notes, on-device dictation, call summaries, search in three languages, a Telegram bot, shared notes and end-to-end encryption.',
    },
    security: {
      title: 'FixNote security: end-to-end encrypted notes',
      description:
        'How FixNote encrypts notes on your device, what the server stores, what the assistant sees and how to work fully offline.',
    },
    privacy: {
      title: 'FixNote privacy policy',
      description: 'What data FixNote has, why it needs it and how to delete it.',
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
    releaseNotes: {
      title: 'What’s new in FixNote: release notes',
      description:
        'Every FixNote version in order: what was added and what was fixed in the Windows and macOS apps and the web app.',
    },
    setup: {
      title: 'How to install FixNote on Windows and Mac',
      description:
        'How to download and install FixNote, what to do about the macOS and SmartScreen warnings on first launch, and how to turn on Pro.',
    },
    notFound: { title: 'Page not found · FixNote', description: 'This page does not exist.' },
  },

  nav: {
    home: 'Home',
    features: 'Features',
    security: 'Security',
    blog: 'Blog',
    download: 'Download',
    pricing: 'Pricing',
    faq: 'FAQ',
    open: 'Open',
    overview: 'Overview',
    tools: 'Tools',
    compare: 'Compare',
    menu: 'Menu',
    releaseNotes: 'What’s new',
    setup: 'Install',
    comparisons: 'Comparisons',
    skip: 'Skip to content',
    language: 'Language',
  },

  hero: {
    eyebrow: 'Private notes with an assistant',
    subtitle: 'Write it your way. Find it instantly.',
    lead: 'Type it, say it or send it on Telegram. The assistant answers from your notes and shows where each answer came from.',
    download: 'Download',
    downloadFor: { mac: 'Download for macOS', windows: 'Download for Windows' },
    more: 'Learn more',
    platforms: 'Windows, macOS and the web · Free, no account needed',
    shotAlt: 'FixNote: today’s notes and an assistant answering with links to notes',
  },

  tiles: [
    {
      id: 'ai',
      eyebrow: 'FixNote AI',
      title: 'Ask your notes.\nGet an answer.',
      text: 'The assistant searches by meaning in three languages and answers with links to your notes. Only your question and the notes it needs go to the model.',
      alt: 'The FixNote assistant in dark mode answering a question about a vacation with links to two notes',
    },
    {
      id: 'calls',
      eyebrow: 'Calls',
      title: 'Call summaries.\nRight on your computer.',
      text: 'Your mic and your computer’s sound are transcribed on the device during the call. The note keeps a summary, decisions and tasks.',
      alt: 'A call note with Summary, Decisions and Tasks and a folded transcript',
    },
    {
      id: 'daily',
      eyebrow: 'Daily note',
      title: 'Today’s tasks.\nRepeats show up on their own.',
      text: 'Ctrl+D opens the daily note. A task with a repeat rule, like “every Sunday”, appears on the right day by itself.',
      alt: 'A daily note with tasks, two of them repeating weekly and monthly',
    },
    {
      id: 'search',
      eyebrow: 'Search',
      title: 'Any language.\nAny keyboard layout.',
      text: '“телеграм” finds “Telegram”, “розыгрыш” finds “giveaway”. Search opens from anywhere with Ctrl+K or ⌘K.',
      alt: 'FixNote search with the matching notes and the word highlighted',
    },
  ],

  features: {
    headline: 'Type it, say it, forward it.\nIt all becomes a note.',
    now: 'Now showing',
    show: 'Show',
    items: [
      {
        id: 'voice',
        title: 'Voice',
        text: 'Dictation is recognized on your computer as you speak. The recording goes nowhere.',
        alt: 'A new voice note being recorded, the text appearing as you speak',
      },
      {
        id: 'telegram',
        title: 'Telegram',
        text: 'Forward text, a voice message or a photo to the bot. Only your app can read them.',
        alt: 'FixNote settings, Integrations, with the Telegram bot connection',
      },
      {
        id: 'tidy',
        title: 'Tidy up',
        text: 'Suggests titles and folders and finds duplicates. Nothing changes without your OK.',
        alt: 'Tidy up in FixNote with suggestions to accept or dismiss',
      },
      {
        id: 'folders',
        title: 'Folders',
        text: 'Folders inside folders, filters by type and period, cards or a list.',
        alt: 'The Travel folder with two notes',
      },
    ],
  },

  reasons: {
    headline: 'A few more reasons\nto keep your notes here.',
    label: 'Why FixNote',
    items: [
      {
        id: 'models',
        title: 'FixNote AI, your own key\nor Ollama.',
        alt: 'AI settings: FixNote AI, your own key or Ollama on your computer',
      },
      {
        id: 'import',
        title: 'Move in from Notion,\nBear and Obsidian.',
        alt: 'FixNote settings, Data, with import and export',
      },
      {
        id: 'offline',
        title: 'Works offline\nand without an account.',
        alt: 'FixNote settings, Advanced, with the models that run on the device',
      },
      {
        id: 'dark',
        title: 'Light and dark.\nJust like your system.',
        alt: 'The FixNote home screen in dark mode',
      },
      {
        id: 'languages',
        title: 'English, Spanish\nand Russian.',
        alt: 'FixNote general settings: language and theme',
      },
    ],
    privacy: {
      title: 'All of it encrypted\nwith a key that only\nyou have.',
      link: 'How we protect your notes',
    },
    prev: 'Previous',
    next: 'Next',
  },

  tools: {
    headline: 'Everything notes need.\nIn one app.',
    compare: 'Compare with other apps',
    label: 'FixNote tools',
    items: [
      {
        id: 'checklists',
        title: 'Checklists',
        text: 'Tasks right in the text. The card shows how many are done.',
        caption: 'A counter on the card',
      },
      {
        id: 'tables',
        title: 'Tables',
        text: 'A budget, a shopping list, a schedule: rows and columns in a note.',
        caption: 'Markdown tables',
      },
      {
        id: 'daily',
        title: 'Daily note',
        text: 'Today’s tasks and notes in one place.',
        caption: 'Ctrl+D',
      },
      {
        id: 'calls',
        title: 'Call summary',
        text: 'Summary, decisions, tasks and the transcript folded away.',
        caption: 'Windows and macOS 14.2+',
      },
      {
        id: 'folders',
        title: 'Folders',
        text: 'Nested folders, filters and sorting.',
        caption: 'Cards or a list',
      },
      {
        id: 'search',
        title: 'Search',
        text: 'By words, by meaning and by the text in images.',
        caption: 'Ctrl+K',
      },
      {
        id: 'dark',
        title: 'Dark mode',
        text: 'Follows your system or switches by hand.',
        caption: 'Like your system',
      },
    ],
  },

  blogTeaser: {
    headline: 'From the blog.',
    all: 'All articles',
    label: 'Articles',
    minutes: 'min read',
  },

  compare: {
    headline: 'Which notes app\nis right for you?',
    lead: 'FixNote next to Notion, Obsidian, Evernote, Apple Notes and Joplin: what each one does and what it costs.',
    more: 'Best AI note-taking apps in 2026',
    included: 'Included',
    limited: 'Limited',
    missing: 'Not offered',
    swipe: 'Swipe to see every app',
    free: 'Free',
    perMonth: 'from {price}/mo',
    rows: {
      free: { label: 'Free with unlimited notes', note: 'No time limit' },
      noAccount: { label: 'Works without an account', note: '' },
      windows: { label: 'Windows app', note: '' },
      web: { label: 'Works in a browser', note: '' },
      e2ee: { label: 'End-to-end encrypted sync', note: 'The server keeps only ciphertext' },
      assistant: { label: 'Assistant answers from your notes', note: 'Ask in your own words' },
      ownModel: { label: 'Your own AI key or a local model', note: 'No plugins needed' },
      dictation: { label: 'Dictation on the device', note: 'Your voice stays offline' },
      calls: { label: 'Call summaries', note: 'Decisions and tasks after a call' },
      telegram: { label: 'Notes from Telegram', note: '' },
      mcp: { label: 'Notes in Claude and Cursor over MCP', note: '' },
    },
    footnote:
      'Based on each vendor’s own site and help pages as of October 2026. A check means the app has the feature on at least one plan (Notion AI and AI Meeting Notes come with Notion Business). Price of the cheapest paid plan, billed monthly. Names and icons belong to their owners.',
    detailed: 'Detailed comparisons',
    vsLink: 'FixNote vs {name}',
  },

  pricing: {
    headline: 'Try Pro.',
    lead: '7 days free, no card needed. Then $7 a month or $60 a year.',
    name: 'FixNote Pro',
    kind: 'Subscription',
    price: '$7',
    year: '$60 a year',
    period: 'a month. Cancel any time.',
    button: 'Try it',
    free: 'Only need your device? Free costs nothing and never runs out.',
    freeLink: 'Download',
    includedTitle: 'What’s in Pro.',
    included: [
      { id: 'sync', title: 'Sync', text: 'Your notes on all your devices, encrypted.' },
      {
        id: 'ai',
        title: 'FixNote AI',
        text: 'The assistant without your own key, with a monthly allowance.',
      },
      { id: 'shared', title: 'Shared notes', text: 'Notes and folders with people, by email.' },
      { id: 'links', title: 'Links', text: 'A link to a note that our server can’t read.' },
      {
        id: 'telegram',
        title: 'Telegram bot',
        text: 'Whatever you forward to the bot becomes a note.',
      },
      {
        id: 'files',
        title: '20 GB of files',
        text: 'Images and files on the server, encrypted too.',
      },
    ],
  },

  steps: {
    headline: 'Up and running in a minute.',
    items: [
      {
        title: 'Download',
        text: 'The installer for Windows or macOS. Or open the web version in your browser.',
      },
      {
        title: 'Write',
        text: 'Your first note needs no sign-up. You only need an account for sync and Pro.',
      },
      {
        title: 'Find',
        text: 'Ctrl+K finds a note by any word, and the assistant answers questions about what you wrote.',
      },
    ],
    all: 'All installers',
  },

  download: {
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
    headline: 'Questions? Answers.',
    more: 'Still have a question? Write to us at',
    items: [
      {
        q: 'Do I need an account?',
        a: 'No. FixNote works on your device without signing up and without internet. An account is only needed for Pro: sync between devices, FixNote AI, shared notes and links.',
      },
      {
        q: 'Who can read my notes?',
        a: 'Only you. Notes are encrypted on your device with a key that stays with you: in your system keychain and in your 12-word recovery phrase. The server stores only ciphertext.',
      },
      {
        q: 'What does the assistant see?',
        a: 'Only your question, your folder names and the notes the assistant found or opened to answer it, never your whole library. In the desktop app you can use Ollama, and then nothing goes online.',
      },
      {
        q: 'How much does FixNote cost?',
        a: 'Everything that runs on your device is free, with no time limit. Pro is $7 a month or $60 a year, and you can try it for 7 days without a card.',
      },
      {
        q: 'What happens to my notes when Pro ends?',
        a: 'They stay on your devices. Sync only downloads changes, and the rest of what goes through the server is off until you renew.',
      },
      {
        q: 'What if I lose my 12-word phrase?',
        a: 'Devices where you are already signed in keep your notes, and from there you can add a new device without the phrase. If you lose both the phrase and every device, no one can recover the notes, including us.',
      },
      {
        q: 'Can I move my notes from Notion, Bear or Obsidian?',
        a: 'Yes. Import understands a Markdown folder (Obsidian too), a Bear backup and a Notion export, and keeps folders, dates and images. On a Mac you can bring in Apple Notes too. You can export everything back to Markdown at any time.',
      },
      {
        q: 'Which languages does FixNote support?',
        a: 'The app is in English, Spanish and Russian. Search and the assistant understand notes that mix these languages, including transliteration and slang.',
      },
    ],
  },

  media: {
    play: 'Play video',
    pause: 'Pause video',
  },

  cta: {
    title: 'Try FixNote',
    text: 'Free, no account needed: Windows, macOS and the web.',
    download: 'Download',
    open: 'Open in the browser',
  },

  notes: [
    'Search runs on your device. With FixNote AI, the question and the passages found pass through our server to the model provider and are not stored. With your own key, requests go straight to the service you chose; with Ollama they stay on your computer.',
    'Free works without an account and has no time limit. An account is needed for Pro: sync, FixNote AI, shared notes, links, the Telegram bot and files on the server.',
    'Call summaries are in the app for Windows and for macOS 14.2 and later. No audio is kept.',
    'The Pro trial starts in the app after you sign in. No card needed; when the week ends, the account goes back to Free unless you subscribe.',
  ],

  footer: {
    notes: 'Footnotes',
    breadcrumbs: 'Breadcrumbs',
    directory: 'Site directory',
    explore: 'Explore',
    product: 'FixNote',
    download: 'Download',
    allPosts: 'All articles',
    support: 'Help',
    webApp: 'Web app',
    rss: 'RSS',
    privacy: 'Privacy',
    email: 'Write to us',
    help: 'A question about FixNote? Write to ',
    rights: 'All rights reserved.',
    compare: 'Comparisons',
    guide: 'Best note-taking apps',
  },

  featuresIndex: {
    eyebrow: 'Features',
    headline: 'Everything FixNote does',
    lead: 'Each feature has its own page: how it works, what reaches the server, and when another app is the better fit.',
    groups: {
      ai: 'Assistant and AI',
      capture: 'Capture and import',
      find: 'Search',
      organize: 'Organize',
      together: 'Sync and sharing',
      privacy: 'Privacy',
    },
    plan: { free: 'Free', pro: 'Pro', both: 'Free and Pro' },
  },

  featurePage: {
    problem: 'The problem',
    privacy: 'Privacy notes',
    privacyLink: 'Read the privacy policy',
    faq: 'Questions',
    related: 'More features',
    all: 'All features',
    plan: 'Plan',
  },

  vsPage: {
    eyebrow: 'Comparison',
    differ: 'Where they differ',
    feature: 'Feature',
    choose: 'How to choose',
    why: 'Why choose FixNote',
    still: 'When {name} still makes sense',
    verdict: 'Verdict',
    faq: 'Questions',
    more: 'More comparisons',
    matrix: 'Every app side by side on the home page',
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
        text: 'Searching your notes happens on your device. The language model gets your question and the notes the assistant found or opened to answer it. Choose FixNote AI, your own key (OpenAI, OpenRouter, Groq, DeepSeek) or Ollama in the desktop app, and then nothing goes online.',
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
        text: 'FixNote works without an account and without internet. The desktop app has an Only on this device mode: it turns off sync, Telegram and links, and the assistant works only through Ollama.',
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
    more: 'More articles',
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

  privacyPage: {
    eyebrow: 'Privacy',
    title: 'Privacy policy',
    updated: 'Updated September 28, 2026',
    lead: 'In short: we cannot read your notes, we do not sell data and we show no ads. Below is exactly what data FixNote has and why.',
    sections: [
      {
        title: 'Without an account',
        text: [
          'FixNote works without an account. Your notes, attachments and settings then stay on your device only. In Only on this device mode the desktop app sends nothing to our server.',
        ],
      },
      {
        title: 'Account',
        text: [
          "Signing in needs an email address, where we send a code. We store the address, your account's public key (so people can send you invitations and Telegram messages) and session data that keeps you signed in.",
        ],
      },
      {
        title: 'Notes and sync',
        text: [
          'Notes, folders and attachments are encrypted on your device with a key only you have. The server stores them encrypted, along with sync data: version numbers, creation and edit dates and whether a note is a daily note. We cannot read the contents.',
        ],
      },
      {
        title: 'Shared notes and folders',
        text: [
          "When you invite someone, we store their email address, role and invitation date. Members see each other's addresses. Note text, folder names and the images and files in shared notes are encrypted with a key only the members have. Edits made together also pass through the server encrypted.",
        ],
      },
      {
        title: 'Note links',
        text: [
          'A linked copy of a note is encrypted with a key kept in the part of the link after “#”. Browsers do not send that part to the server, so we store a copy we cannot read. You can turn a link off at any time.',
        ],
      },
      {
        title: 'Assistant',
        text: [
          'Search across your notes runs on your device. When you ask FixNote AI, your question and the matching note excerpts pass through our server to a language model provider to get the answer. We do not store or log what is in these requests.',
          'With your own key, requests go straight to the service you chose and follow its terms. With Ollama everything stays on your computer.',
        ],
      },
      {
        title: 'Voice',
        text: ['Speech is recognized on your device. The recording is not sent anywhere.'],
      },
      {
        title: 'Telegram',
        text: [
          'If you connect the bot, messages reach us from Telegram and are sealed with your public key right away. We keep them sealed until your app picks them up, and we keep the link between your account and the chat. Telegram itself handles messages under its own terms.',
        ],
      },
      {
        title: 'Other services',
        text: [
          'Account data and encrypted notes are stored with Supabase, and sign-in emails are sent by Resend. Payments for Pro are handled by Suby: we get the state of the subscription, never the card.',
          'The app downloads its search and speech models from Hugging Face. Link cards in the browser are fetched through our server (URLs are not logged), and directly in the desktop app. The desktop app checks for updates at fixnote.space and GitHub; the Microsoft Store version gets them from the Store.',
        ],
      },
      {
        title: 'Ads and tracking',
        text: [
          'There are no ads, analytics or trackers in the app or on the site. We do not sell data or share it for advertising.',
        ],
      },
      {
        title: 'Keeping and deleting data',
        text: [
          'We keep your data while you have an account. You can export your notes at any time: Settings → Data.',
          'One exception: if an account has never paid for Pro, the server copy of its images and files is removed 90 days after its Pro trial ends. The app says so a month before and keeps the files on your devices. Nothing is removed for anyone who has paid.',
          'To delete your account and everything linked to it on the server, email us from the address you sign in with. We delete the data within 30 days. Notes on your devices stay with you.',
        ],
      },
      {
        title: 'Children',
        text: [
          'FixNote is not meant for children under 13, and we do not knowingly collect their data.',
        ],
      },
      {
        title: 'Changes',
        text: ['If this policy changes, we will update this page and the date at the top.'],
      },
    ],
    contact: 'Questions about your data and deletion requests:',
  },

  releasePage: {
    eyebrow: 'What’s new',
    title: 'FixNote release notes',
    lead: 'What each version added and fixed. The desktop app updates itself, and the web app is always the latest.',
    version: 'Version',
    latest: 'Latest',
    site: 'Website only: nothing changed in the app.',
  },

  setupPage: {
    eyebrow: 'Install',
    title: 'How to install FixNote',
    lead: 'Download the installer, answer your system once on first launch, and sign in if you want Pro.',
    steps: [
      {
        title: 'Download FixNote',
        text: 'Pick the installer for Windows or for your Mac: Apple silicon (M1 and later) or Intel. On a Mac, open the .dmg and drag FixNote into Applications.',
      },
      {
        title: 'Open it the first time',
        text: 'Until FixNote is notarized by Apple, macOS asks about it on first launch, and Windows may show SmartScreen. You answer once; after that it opens like any other app and updates itself.',
      },
      {
        title: 'Sign in if you want Pro',
        text: 'FixNote works right away without an account. For sync, FixNote AI and shared notes, sign in with your email in Settings → Account & sync. The 7-day Pro trial needs no card; you subscribe in Settings → Billing, and Pro works at once on every device of the account.',
      },
    ],
    macTitle: 'My Mac says FixNote can’t be opened',
    mac: [
      'macOS 15 Sequoia and later: open System Settings → Privacy & Security, scroll down and click Open Anyway.',
      'macOS 14 Sonoma or earlier: in Finder, right-click FixNote, choose Open and confirm.',
      'If macOS says the app is damaged, run this once in Terminal:',
    ],
    windowsTitle: 'If Windows shows SmartScreen',
    windows:
      'Click More info, then Run anyway. SmartScreen shows this window for programs that don’t have a publisher signature yet.',
    help: 'Can’t get it installed? Write to',
    helpAfter: 'with a screenshot of the system message.',
  },

  notFound: {
    title: 'This page does not exist',
    text: 'The link may be outdated. Start from the home page.',
    home: 'Home',
  },
}
