import type { Part } from './types'

/**
 * English copy: the reference for es.ts, which must have the same shape (see Dict).
 */
export const en = {
  meta: {
    siteName: 'Fixnote',
    home: {
      title: 'AI note-taking app with end-to-end encryption | Fixnote',
      description:
        'A private AI note-taking app for Windows, macOS and the web. Notes are end-to-end encrypted; type or dictate, and the assistant answers with sources.',
    },
    features: {
      title: 'Fixnote features: AI assistant, voice notes, meeting notes',
      description:
        'An AI assistant for your notes, offline voice to text, bot-free meeting notes, OCR, a Telegram bot, shared notes and end-to-end encryption.',
    },
    security: {
      title: 'Fixnote security: how your notes are protected',
      description:
        'How Fixnote encrypts notes on your device, what the server stores, what the assistant sees and how to work fully offline.',
    },
    privacy: {
      title: 'Fixnote privacy policy',
      description: 'What data Fixnote has, why it needs it and how to delete it.',
    },
    download: {
      title: 'Download Fixnote: notes app for Windows and Mac',
      description:
        'Fixnote for Windows and macOS (Apple Silicon and Intel), plus a web version that runs in your browser. Free, no account needed.',
    },
    blog: {
      title: 'Fixnote blog: note-taking, AI and privacy',
      description:
        'How to keep notes you can find again, how end-to-end encryption works and how an assistant helps you remember.',
    },
    releaseNotes: {
      title: 'What’s new in Fixnote: release notes',
      description:
        'Every Fixnote version in order: what was added and what was fixed in the Windows and macOS apps and the web app.',
    },
    setup: {
      title: 'How to install Fixnote on Windows and Mac',
      description:
        'How to download and install Fixnote, what to do about the macOS and SmartScreen warnings on first launch, and how to turn on Pro.',
    },
    windows: {
      title: 'Notes app for Windows 10 and 11, free and offline | Fixnote',
      description:
        'A note-taking app for Windows 10 and 11: bot-free call summaries, offline dictation, system-wide shortcuts, MCP for Claude and encryption. Free to use.',
    },
    notFound: { title: 'Page not found · Fixnote', description: 'This page does not exist.' },
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
    windows: 'Fixnote for Windows',
    tidy: 'Tidy up',
    integrations: 'Integrations',
    search: 'Search',
    privacy: 'Privacy',
    help: 'Help',
  },

  hero: {
    eyebrow: 'Private notes with an assistant',
    subtitle: 'Write it your way. Find it instantly.',
    lead: 'Type it, say it or send it on Telegram. The assistant answers from your notes and shows where each answer came from.',
    download: 'Download',
    downloadFor: { mac: 'Download for macOS', windows: 'Download for Windows' },
    more: 'Learn more',
    platforms: 'Windows, macOS and the web · Free, no account needed',
    shotAlt: 'Fixnote: today’s notes and an assistant answering with links to notes',
  },

  intro: {
    line1: 'Save it your way.',
    line2: 'Find it when it matters.',
    lead: 'A simple notes app for ideas, plans,\nand everything worth keeping.',
    download: 'Download',
    tryBrowser: 'Try in browser',
    free: 'Free to use',
    noAccount: 'No account required',
    shotAlt:
      'Fixnote: a shared trip note edited by several people, and the assistant finding related notes',
    offline: { title: 'Works offline', text: 'Write and search your notes without internet.' },
    together: { title: 'Edit together', text: 'Share notes and see changes in real time.' },
    encrypted: {
      title: 'End-to-end encrypted',
      text: 'Your synced notes are encrypted before\nleaving your device.',
    },
    refine: {
      title: 'Refine with AI',
      text: 'Rewrite, shorten, or improve text right in your notes.',
    },
    moveIn: {
      title: 'Bring your notes over',
      text: 'Import from Bear, Notion, Obsidian, and more.',
    },
    eyebrow: 'Experience',
    title1: 'Simple notes.',
    title2: 'More possibilities.',
    sub: 'Everything you need for everyday notes,\nwithout the extra complexity.',
  },

  /** The animated "Refine with AI" card in the Experience collage (RefineCard.astro, scripts/refine). */
  refineCard: {
    title: 'Japan trip — April 2027',
    subtitle: 'Tokyo · Hakone · Kyoto · Osaka  ·  Apr 2–14, 12 days',
    diff: [
      { kind: 'same' as const, text: 'Cherry blossom season, so ' },
      { kind: 'del' as const, text: 'everything books' },
      { kind: 'ins' as const, text: 'hotels and trains book' },
      { kind: 'same' as const, text: ' up ' },
      { kind: 'del' as const, text: 'early' },
      { kind: 'ins' as const, text: 'months ahead' },
      { kind: 'same' as const, text: '.' },
    ],
    line2: 'Flights and the first Tokyo nights need to be locked in before December.',
    before: 'Before we go',
    tasks: [
      { text: 'Book flights to Tokyo Haneda', done: true },
      { text: 'Renew passports', done: true },
      { text: 'Get a 14-day JR Pass', done: false, soft: true },
      { text: 'Reserve teamLab Planets tickets for Apr 4', done: false, soft: true },
      { text: 'Order eSIMs for everyone', done: false },
    ],
    menu: {
      prompt: 'Ask AI to edit this text…',
      items: ['Rewrite', 'Shorten', 'Reformat', 'Fix mistakes'],
      more: ['New note from this', 'Delete'],
    },
    panel: {
      accept: 'Accept',
      discard: 'Discard',
      tryAgain: 'Try again',
      esc: 'Esc',
    },
  },

  /** The animated app under the hero (HeroApp.astro, scripts/hero): demo notes only. */
  heroApp: {
    people: { alex: 'Alex', sofia: 'Sofia', ben: 'Ben' },
    sidebar: {
      search: 'Search',
      home: 'Home',
      today: 'Today',
      links: 'Links',
      tidy: 'Tidy up',
      folders: 'Folders',
      work: 'Work',
      projects: 'Projects',
      meetings: 'Meetings',
      personal: 'Personal',
      ideas: 'Ideas',
      travel: 'Travel',
      trip: 'Iceland 2027',
      weekend: 'Lisbon weekend',
    },
    shared: 'Shared note',
    edited: [
      'Edited by Alex · 2 min ago',
      'Edited by Sofia · just now',
      'Edited by Sofia and Ben · just now',
      'Edited by Sofia, Ben, Alex · just now',
    ],
    title: 'Iceland trip — September 2027',
    subtitle: 'Reykjavík · South Coast · Sep 6–12 · 7 days',
    lead: 'A week together in Iceland. ',
    intro: 'Keep the route flexible and leave room for weather changes.',
    introTo: 'Keep the route flexible and choose stays with flexible cancellation.',
    before: 'Before we go',
    tasks: [
      'Book flights to Keflavík',
      'Check passport expiry dates',
      'Compare rental cars',
      'Reserve the first night in Reykjavík',
      'Download offline maps',
    ],
    route: 'Route',
    stops: [
      {
        place: 'Reykjavík',
        text: 'arrival and an easy first evening.',
        find: '',
        to: '',
        append: '',
      },
      {
        place: 'Golden Circle',
        text: 'one full day.',
        find: 'one full day',
        to: 'one relaxed day with time for stops',
        append: '',
      },
      {
        place: 'Vík',
        text: '3 nights as our South Coast base.',
        find: '3 nights',
        to: '2 nights',
        append: ' Leave time for the coast and keep the second afternoon flexible.',
      },
      {
        place: 'Reykjavík',
        text: 'final night before the flight.',
        find: 'flight.',
        to: 'flight, close to the airport bus stop. Keep the last evening free.',
        append: '',
      },
    ],
    footer: { before: 'Budget and bookings live in ', link: 'Iceland trip budget', after: '.' },
    weather: {
      heading: 'Weather backup',
      text: 'Keep one day flexible so we can adjust the route if the weather changes. Save an indoor option for a rainy afternoon in Reykjavík.',
      find: 'an indoor option',
      to: 'a museum or café',
    },
    packing: {
      heading: 'Shared packing',
      text: 'Bring waterproof layers and a spare charging cable. We can share one camera tripod and keep the packing list in this note.',
    },
    booking: {
      heading: 'Booking details',
      text: 'Save confirmation numbers and pickup instructions here so everyone can find them.',
    },
    checklist: {
      title: 'Driving checklist',
      source: 'Source:',
      insert: ' and save the booking number',
    },
    assistant: {
      title: 'Assistant',
      placeholder: 'Ask, or ask me to do something…',
      q1: 'Find my saved notes about stays near Vík and driving in Iceland.',
      q2: 'Turn the driving note into a short checklist and add it below the route.',
      searching: 'Looking through your notes…',
      found: 'Found 3 relevant notes',
      p1: 'I found three saved notes for this trip: stays near Vík, a driving checklist, and your shared budget.',
      p2: 'The stays note includes flexible-booking options. The driving checklist covers pickup, offline maps, and checks before each driving day.',
      preparing: 'Preparing a checklist…',
      ready: 'Checklist ready',
      intro: 'Here’s a short checklist based on Iceland driving checklist:',
      items: [
        'Confirm the rental pickup details.',
        'Download offline maps.',
        'Check road and weather conditions before each driving day.',
      ],
      add: 'Add to note',
      added: 'Added',
      sources: [
        { title: 'South Coast stays', meta: 'Travel · Jun 2026' },
        { title: 'Iceland driving checklist', meta: 'Travel · Aug 2026' },
        { title: 'Iceland trip budget', meta: 'Travel · Sep 2026' },
      ],
    },
  },

  landing: {
    faq: {
      eyebrow: 'FAQ',
      title1: 'Everything you',
      title2: 'need to know',
      title3: 'before\ngetting started.',
      contact: 'Contact us',
      items: [
        {
          q: 'Is Fixnote really free?',
          a: 'Yes. Everything that runs on your device is free, with no time limit and no account required. Pro adds encrypted sync, collaboration, and cloud features.',
        },
        {
          q: 'Can I use Fixnote without the internet?',
          a: 'Yes. Write, search, and organize your notes on your device without a connection. Sync and cloud features need the internet.',
        },
        {
          q: 'Who can read my notes?',
          a: "Your synced notes are encrypted on your device, and Fixnote's servers can't read them. If you use cloud AI, the information needed for your request is sent to your chosen provider.",
        },
        {
          q: 'Can I import my existing notes?',
          a: 'Yes. Import from Bear, Notion, Obsidian, or a Markdown folder. Apple Notes import is available on macOS. You can export your notes to Markdown at any time.',
        },
        {
          q: 'What happens if I cancel Pro?',
          a: 'Your notes stay on your devices. You keep Pro until the end of your paid period, then return to Free. Cloud features are paused until you renew.',
        },
        {
          q: 'Which devices does Fixnote support?',
          a: 'Fixnote is available for Windows, macOS, and in your browser. You can also use the web app on your phone.',
        },
      ],
    },
    closing: {
      title: 'Turn scattered thoughts\ninto something useful.',
    },
    footer: {
      question: 'A question about Fixnote?',
      write: 'Write to',
      contact: 'Contact us',
    },
    tidy: {
      eyebrow: 'Tidy up',
      title1: 'Save now.',
      title2: 'Sort later.',
      lead: 'Don’t worry about organizing every note.\nFixnote helps you tidy things up when you need it.',
      items: [
        {
          title: 'Smarter folders',
          text: 'Get suggestions for where your notes belong.',
        },
        {
          title: 'Duplicate cleanup',
          text: 'Find similar notes and decide what to keep.',
        },
        {
          title: 'Better titles',
          text: 'Turn unclear titles into something meaningful.',
        },
      ],
      link: 'Explore Tidy up',
      alt: 'Tidy up in Fixnote: suggested folders, titles and duplicates, each with Accept',
    },
    integrations: {
      eyebrow: 'Integrations',
      title: 'Your notes, one prompt away.',
      lead: 'Connect Fixnote to ChatGPT, Claude, Cursor, and Codex. Search, create,\nand update notes right from the tools you already use.',
      tools: 'Supported tools',
      mcp: {
        title: 'Powered by MCP',
        text: 'Connect compatible AI tools to your notes without copying information between apps.',
        link: 'How MCP works',
      },
      control: {
        title: 'You’re in control',
        text: 'Choose which notes connected tools can access and what they’re allowed to do.',
        link: 'How permissions work',
      },
      alt: 'A note in the Fixnote desktop app',
    },
    recall: {
      title1: 'Remember the idea.',
      title2: 'Not the exact words.',
      lead: 'Search by meaning, across languages, and even through text in images.\nNo exact wording required.',
      meaning: {
        title: 'Search by meaning',
        text: 'Find notes without remembering the exact words.',
        link: 'Explore semantic search',
      },
      languages: {
        title: 'Across languages',
        text: 'Search across English, Spanish, and Russian notes.',
        link: 'Explore multilingual search',
      },
      images: {
        title: 'Text in images',
        text: 'Find notes by words in screenshots and photos.',
        link: 'Explore image search',
      },
      keys: {
        title: 'Search in a keystroke',
        text: 'Search your notes with a quick keyboard shortcut.',
        link: 'Explore keyboard shortcuts',
      },
      voice: {
        title: 'Search voice notes',
        text: 'Find ideas you recorded, even if you never typed them.',
        link: 'Explore voice notes',
      },
      /** What the animated cards show (Recall.astro, views/home/recall): demo notes only. */
      demo: {
        search: 'Search',
        esc: 'Esc',
        notes: 'Notes',
        meaning: {
          query: 'feedback',
          similar: 'Similar in meaning',
          // [word] is highlighted as a match.
          hits: [
            {
              title: 'Design [feedback]',
              text: 'Notes from the team. Reviewed the latest screens',
            },
            { title: 'November 12', text: 'Collected [feedback] on the new homepage layout' },
          ],
          related: [
            {
              title: 'Design review',
              text: 'Discussed the latest interface updates. The team suggested simplifying the navigation.',
            },
            {
              title: 'Product improvements',
              text: 'Users find the onboarding confusing. Consider reducing the number of steps.',
            },
            {
              title: 'Meeting notes',
              text: 'Reviewed the prototype together. Agreed to improve readability and adjust the layout.',
            },
          ],
        },
        voice: [
          {
            phrase: 'launch timeline',
            notes: [
              'Launch planning call',
              'Product launch brainstorm',
              'Marketing timeline',
              'Release checklist discussion',
              'Launch retrospective',
            ],
          },
          {
            phrase: 'website feedback',
            notes: [
              'Homepage review',
              'Website feedback session',
              'Navigation improvements',
              'Landing page discussion',
              'Design team catch-up',
            ],
          },
          {
            phrase: 'next sprint priorities',
            notes: [
              'Sprint planning call',
              'Next sprint priorities',
              'Backlog review',
              'Engineering team sync',
              'Product roadmap discussion',
            ],
          },
        ],
        images: {
          query: 'morning',
          hits: [
            { title: 'App design ideas', text: 'Screenshot attached' },
            { title: 'Weekend photos', text: 'Photo attached' },
            { title: 'Wallet app', text: 'Screenshot attached' },
          ],
        },
        languages: {
          query: 'travel plans',
          home: 'Home',
          travel: 'Travel',
          list: [
            { title: 'Reading list', text: 'Books and essays to read over the next few weeks.' },
            {
              title: 'Desk setup ideas',
              text: 'Find a desk lamp, tidy up the cables, and add a bookshelf.',
            },
            {
              title: 'Receta de pasta',
              text: 'Tomates, albahaca y una salsa sencilla para la cena.',
            },
            {
              title: 'Website feedback',
              text: 'Simplify the navigation and make the main action easier to find.',
            },
          ],
          hits: [
            {
              title: 'Weekend in Copenhagen',
              text: 'Train tickets, hotel check-in, and places to visit on Saturday.',
            },
            {
              title: 'Viaje a Barcelona',
              text: 'Reservar el hotel, guardar los billetes y preparar el itinerario.',
            },
          ],
          // The open note: the first list note before the search, the second hit after it.
          before: [
            {
              heading: 'Next up',
              text: 'Start with a short novel and finish the essay collection.',
            },
            {
              heading: 'Recommendations',
              text: 'Ask friends for a book they would happily read again.',
            },
          ],
          after: [
            {
              heading: 'Antes de salir',
              text: 'Confirmar la reserva del hotel y guardar los billetes en el móvil.',
            },
            {
              heading: 'Durante el viaje',
              text: 'Visitar el barrio Gótico y dejar tiempo para pasear.',
            },
          ],
        },
        keys: {
          query: 'project ideas',
          key: 'command',
          hits: [
            {
              title: 'Landing page ideas',
              text: 'A simpler hero, clearer benefits, and a short product demo.',
            },
            {
              title: 'Onboarding improvements',
              text: 'Reduce setup steps and help new users reach their first note.',
            },
            {
              title: 'Weekend photography',
              text: 'Try a small photo series about light, texture, and everyday objects.',
            },
          ],
        },
      },
    },
    privacy: {
      eyebrow: 'Privacy & control',
      title1: 'Decide where your notes live,',
      title2: 'what gets shared, and how AI works',
      title3: 'with your information.',
      toggle: {
        title: 'Only on this device',
        text: 'Cloud service can be enabled separately.',
        activeText: 'Your notes stay here. No cloud sync or sharing.',
      },
      provider: {
        title: 'Choose your provider',
        text: 'Fixnote AI, your own key, or Ollama',
        activeTitle: 'Run AI locally',
        activeText: 'Use Ollama to keep AI processing on your device.',
      },
      local: {
        title: 'Keep it local',
        text: 'Keep your notes on your device without cloud sync or an account.',
        link: 'Explore local-only mode',
      },
      terms: {
        title: 'AI on your terms',
        text: 'Use Fixnote AI, bring your own API key, or run AI locally with Ollama.',
        link: 'Compare AI options',
      },
      synced: {
        title: 'Private, even when synced',
        text: 'Your notes are encrypted before syncing.\nNot even Fixnote can read them.',
        link: 'How encryption works',
      },
    },
    voice: {
      title1: 'Taking notes should feel\nas natural as having a thought.',
      title2: 'Just write it down or say it out loud.',
      eyebrow: 'Voice capture',
      title: 'Just say it. Save it.',
      text: 'Speak your thoughts. Fixnote turns them into searchable notes.',
      link: 'Explore voice notes',
    },
    plans: {
      eyebrow: 'Pricing',
      title1: 'Start free.',
      title2: 'Upgrade when you need more.',
      lead: 'Everything you need for everyday notes is free.\nUpgrade to Pro for encrypted sync, collaboration, and cloud-powered features.',
      monthly: 'Monthly',
      annually: 'Annually',
      free: {
        name: 'Free',
        price: '$0',
        note: 'Free forever',
        noAccount: 'No account required.',
        items: [
          'Unlimited notes',
          'Offline access',
          'Smart search',
          'Voice dictation',
          'Import and export',
        ],
        button: 'Download Fixnote',
      },
      pro: {
        name: 'Pro',
        month: '$7 / month',
        year: '$60 / year',
        perYear: '$60 yearly',
        perMonth: '$5 a month',
        cancel: 'Cancel anytime',
        items: [
          'Everything in Free',
          'Encrypted sync',
          'Fixnote AI',
          'Shared notes and folders',
          'Integrations',
          '20 GB encrypted storage',
        ],
        button: 'Upgrade to Pro',
      },
    },
  },

  tiles: [
    {
      id: 'ai',
      eyebrow: 'Fixnote AI',
      title: 'Ask your notes.\nGet an answer.',
      text: 'The assistant searches by meaning in three languages and answers with links to your notes. Only your question and the notes it needs go to the model.',
      alt: 'The Fixnote assistant in dark mode answering a question about a vacation with links to two notes',
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
      alt: 'Fixnote search with the matching notes and the word highlighted',
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
        alt: 'Fixnote settings, Integrations, with the Telegram bot connection',
      },
      {
        id: 'tidy',
        title: 'Tidy up',
        text: 'Suggests titles and folders and finds duplicates. Nothing changes without your OK.',
        alt: 'Tidy up in Fixnote with suggestions to accept or dismiss',
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
    label: 'Why Fixnote',
    items: [
      {
        id: 'models',
        title: 'Fixnote AI, your own key\nor Ollama.',
        alt: 'AI settings: Fixnote AI, your own key or Ollama on your computer',
      },
      {
        id: 'import',
        title: 'Move in from Notion,\nBear and Obsidian.',
        alt: 'Fixnote settings, Data, with import and export',
      },
      {
        id: 'offline',
        title: 'Works offline\nand without an account.',
        alt: 'Fixnote settings, Advanced, with the models that run on the device',
      },
      {
        id: 'dark',
        title: 'Light and dark.\nJust like your system.',
        alt: 'The Fixnote home screen in dark mode',
      },
      {
        id: 'languages',
        title: 'English, Spanish\nand Russian.',
        alt: 'Fixnote general settings: language and theme',
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
    label: 'Fixnote tools',
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
    lead: 'Fixnote next to Notion, Obsidian, Evernote, Apple Notes and Joplin: what each one does and what it costs.',
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
    vsLink: 'Fixnote vs {name}',
  },

  pricing: {
    headline: 'Try Pro.',
    lead: '7 days free, no card needed. Then $7 a month or $60 a year.',
    name: 'Fixnote Pro',
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
        title: 'Fixnote AI',
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
      'Until the app is notarized by Apple, macOS may say it is damaged. Drag Fixnote to Applications and run this once in Terminal:',
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
        a: 'No. Fixnote works on your device without signing up and without internet. An account is only needed for Pro: sync between devices, Fixnote AI, shared notes and links.',
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
        q: 'How much does Fixnote cost?',
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
        q: 'Which languages does Fixnote support?',
        a: 'The app is in English, Spanish and Russian. Search and the assistant understand notes that mix these languages, including transliteration and slang.',
      },
    ],
  },

  media: {
    play: 'Play video',
    pause: 'Pause video',
  },

  cta: {
    title: 'Try Fixnote',
    text: 'Free, no account needed: Windows, macOS and the web.',
    download: 'Download',
    open: 'Open in the browser',
  },

  notes: [
    'Search runs on your device. With Fixnote AI, the question and the passages found pass through our server to the model provider and are not stored. With your own key, requests go straight to the service you chose; with Ollama they stay on your computer.',
    'Free works without an account and has no time limit. An account is needed for Pro: sync, Fixnote AI, shared notes, links, the Telegram bot and files on the server.',
    'Call summaries are in the app for Windows and for macOS 14.2 and later. No audio is kept.',
    'The Pro trial starts in the app after you sign in. No card needed; when the week ends, the account goes back to Free unless you subscribe.',
  ],

  consent: {
    title: 'Cookies and analytics',
    text: 'May we count visits to this site with Google Analytics? It sets cookies. It never sees your notes or the app.',
    more: 'How we use cookies',
    accept: 'Allow',
    decline: 'No thanks',
    settings: 'Cookies',
  },

  footer: {
    notes: 'Footnotes',
    breadcrumbs: 'Breadcrumbs',
    directory: 'Site directory',
    explore: 'Explore',
    product: 'Fixnote',
    download: 'Download',
    allPosts: 'All articles',
    support: 'Help',
    webApp: 'Web app',
    rss: 'RSS',
    privacy: 'Privacy',
    email: 'Write to us',
    help: 'A question about Fixnote? Write to ',
    rights: 'All rights reserved.',
    compare: 'Comparisons',
    guide: 'Best note-taking apps',
  },

  featuresIndex: {
    eyebrow: 'Features',
    headline: 'Everything Fixnote does',
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
    why: 'Why choose Fixnote',
    still: 'When {name} still makes sense',
    verdict: 'Verdict',
    faq: 'Questions',
    more: 'More comparisons',
    matrix: 'Every app side by side on the home page',
  },

  securityPage: {
    eyebrow: 'Security',
    headline: [
      'Your notes are',
      '\n',
      'readable only by',
      { text: 'you', tone: 'green' },
    ] satisfies Part[],
    lead: 'Fixnote is built so that you don’t have to trust us: encryption happens on your device, and the server stores only what it cannot read.',
    sections: [
      {
        title: 'Encrypted on your device',
        text: 'When you create an account, Fixnote generates a random key and shows it to you as 12 words. Every note is encrypted on the device (XChaCha20-Poly1305) with a fresh key, wrapped with your account key. The ciphertext is bound to its note, so the server cannot swap one note for another.',
      },
      {
        title: 'What the server stores',
        text: 'Encrypted notes, folders and attachments, what sync needs to line devices up (version numbers, created and edited dates, which note is a daily note), and your email address for sign-in codes. Note text, folder names and images are never on the server in readable form.',
      },
      {
        title: 'What the assistant sees',
        text: 'Searching your notes happens on your device. The language model gets your question and the notes the assistant found or opened to answer it. Choose Fixnote AI, your own key (OpenAI, OpenRouter, Groq, DeepSeek) or Ollama in the desktop app, and then nothing goes online.',
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
        text: 'Fixnote works without an account and without internet. The desktop app has an Only on this device mode: it turns off sync, Telegram and links, and the assistant works only through Ollama.',
      },
    ],
    stored: 'What the server stores for a note',
  },

  downloadPage: {
    eyebrow: 'Download',
    headline: ['Fixnote for', { text: 'your', tone: 'brand' }, 'devices'] satisfies Part[],
    lead: 'Pick the installer for your system or open the web version. Once you sign in, notes sync between all your devices.',
    windows: 'What Fixnote does on Windows',
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
    headline: ['Notes', { text: 'about notes', tone: 'brand' }] satisfies Part[],
    lead: 'How to write thoughts down so you can find them later, and how Fixnote works inside.',
    read: 'Read',
    minutes: 'min',
    back: 'All articles',
    published: 'Published',
    updated: 'Updated',
    author: 'Author',
    authorPosts: 'Articles',
    empty: 'Articles are coming soon.',
    otherLanguages: 'This article in other languages',
  },

  privacyPage: {
    eyebrow: 'Privacy',
    title: 'Privacy policy',
    updated: 'Updated November 19, 2026',
    lead: 'In short: we cannot read your notes, we do not sell data and we show no ads. Below is exactly what data Fixnote has and why.',
    sections: [
      {
        title: 'Without an account',
        text: [
          'Fixnote works without an account. Your notes, attachments and settings then stay on your device only. In Only on this device mode the desktop app sends nothing to our server.',
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
          'Search across your notes runs on your device. When you ask Fixnote AI, your question and the matching note excerpts pass through our server to a language model provider to get the answer. We do not store or log what is in these requests.',
          'With your own key, requests go straight to the service you chose and follow its terms. With Ollama everything stays on your computer.',
        ],
      },
      {
        title: 'AI apps (remote access)',
        text: [
          'If you connect an AI app such as ChatGPT or Claude to Fixnote, its requests come to our server mcp.fixnote.space and are passed to your device where Fixnote is open. The device decrypts the notes and answers, and the answer with the notes it needs passes through our server to that app. Requests and answers only pass through memory: we do not store or log them. The server has no keys to your notes. When you approve the connection in the Fixnote app, the server keeps the address back to the AI app for at most two minutes, until the connect page in your browser picks it up.',
          'We keep only what is needed to run it: which apps you connected, when they last asked, which access you revoked, and the ids of the folders and notes you let them see. You can revoke access in Settings → Integrations. What the AI app receives is then handled under its provider’s own rules.',
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
          'Account data and encrypted notes are stored with Supabase, and sign-in emails are sent by Resend. Card payments for Pro are processed by ListoPays and crypto payments by Suby: we get the status of the payment or subscription, never the card details.',
          'The app downloads its search and speech models from Hugging Face. Link cards in the browser are fetched through our server (URLs are not logged), and directly in the desktop app. The desktop app checks for updates at fixnote.space and GitHub; the Microsoft Store version gets them from the Store.',
        ],
      },
      {
        title: 'Ads and analytics',
        id: 'cookies',
        text: [
          'There are no ads, analytics or trackers in the app. We do not sell data or share it for advertising.',
          'Cloudflare, which serves the fixnote.space website, counts visits without cookies (Cloudflare Web Analytics): which pages are read, the site people come from, their country and browser. It does not identify you, so it needs no consent. Clicks on Download are counted from the requests to our download links.',
          'If you allow it in the banner, Google Analytics counts visits too and sets cookies for this. Without your consent it is not loaded. You can change your choice with "Cookies" at the bottom of any page. Your notes and anything you do in the app never reach either of them.',
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
          'Fixnote is not meant for children under 13, and we do not knowingly collect their data.',
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
    title: 'Fixnote release notes',
    lead: 'What each version added and fixed. The desktop app updates itself, and the web app is always the latest.',
    version: 'Version',
    latest: 'Latest',
    site: 'Website only: nothing changed in the app.',
  },

  setupPage: {
    eyebrow: 'Install',
    title: 'How to install Fixnote',
    lead: 'Download the installer, answer your system once on first launch, and sign in if you want Pro.',
    steps: [
      {
        title: 'Download Fixnote',
        text: 'Pick the installer for Windows or for your Mac: Apple silicon (M1 and later) or Intel. On a Mac, open the .dmg and drag Fixnote into Applications.',
      },
      {
        title: 'Open it the first time',
        text: 'Until Fixnote is notarized by Apple, macOS asks about it on first launch, and Windows may show SmartScreen. You answer once; after that it opens like any other app and updates itself.',
      },
      {
        title: 'Sign in if you want Pro',
        text: 'Fixnote works right away without an account. For sync, Fixnote AI and shared notes, sign in with your email in Settings → Account & sync. The 7-day Pro trial needs no card; you subscribe in Settings → Billing, and Pro works at once on every device of the account.',
      },
    ],
    macTitle: 'My Mac says Fixnote can’t be opened',
    mac: [
      'macOS 15 Sequoia and later: open System Settings → Privacy & Security, scroll down and click Open Anyway.',
      'macOS 14 Sonoma or earlier: in Finder, right-click Fixnote, choose Open and confirm.',
      'If macOS says the app is damaged, run this once in Terminal:',
    ],
    windowsTitle: 'If Windows shows SmartScreen',
    windows:
      'Click More info, then Run anyway. SmartScreen shows this window for programs that don’t have a publisher signature yet.',
    help: 'Can’t get it installed? Write to',
    helpAfter: 'with a screenshot of the system message.',
  },

  windowsPage: {
    eyebrow: 'Windows',
    headline: 'A notes app for your Windows PC',
    lead: 'Fixnote is a note-taking app for Windows 10 and 11 that works offline and without an account. It writes up your calls with no bot in the meeting, turns dictation into text on your own computer and opens with a shortcut over any window.',
    facts: 'Windows 10 and 11, 64-bit · Free, no time limit · No account needed',
    shotAlt: 'Fixnote on Windows: today’s notes and the assistant answering with links to notes',
    sections: [
      {
        id: 'calls',
        title: 'Call summaries with no bot in the call',
        text: 'Zoom, Teams, Telegram or any other app: Fixnote takes the computer’s sound through WASAPI, the standard Windows audio interface, and your microphone. No bot joins, no drivers, no extensions. Speech is transcribed on your computer while you talk, and after “Finish” the model writes a summary, decisions and tasks. No audio is kept.',
        link: 'How call summaries work',
      },
      {
        id: 'shortcuts',
        title: 'Shortcuts from any window and a tray icon',
        text: 'Fixnote does not need to stay on screen. Closing the window hides it in the tray, and the system-wide shortcuts work while a browser or an editor is in front. The tray icon’s menu has a new note, a voice note, today’s note, search and call recording. Shortcuts inside the app follow the key’s place on the keyboard, so Ctrl+K works in any layout. You can change each one in Settings → Shortcuts.',
        link: 'How search works',
      },
      {
        id: 'voice',
        title: 'Dictation without the internet',
        text: 'A voice note is transcribed on your computer while you speak: the recording is cut at pauses, so the text is almost ready when you finish. The sound goes nowhere. The speech model downloads once, and after that dictation works offline. Russian is recognized by GigaAM, English and Spanish by Whisper.',
        link: 'More about voice notes',
      },
      {
        id: 'mcp',
        title: 'Your notes in Claude, Cursor and Codex',
        text: 'The Windows app has its own MCP server. The “Add to Claude Desktop”, “Add to Cursor” and “Add to Codex” buttons in Settings → AI write it into that app’s settings for you. You pick the access level and the folders it can see, and every change lands in the AI log, where you can undo it. The server runs on your computer, with no account, on the free plan.',
        link: 'How to connect the MCP server',
      },
      {
        id: 'privacy',
        title: 'Encryption, and a mode with no server at all',
        text: 'For sync, notes are encrypted on your computer, and the key is kept in Windows Credential Manager and in a 12-word recovery phrase. The server stores only ciphertext. Want notes that never leave the computer? “Only on this device” turns off everything that reaches our server, and the assistant runs on Ollama.',
        link: 'How the encryption works',
      },
      {
        id: 'markdown',
        title: 'Markdown, import and your other devices',
        text: 'Notes are Markdown: headings, checklists, tables, images and files. You can bring them in from a Markdown or Obsidian folder, a Bear backup or a Notion export, and export everything back to Markdown at any time. With Pro, the same notes sync with your Mac and the web app.',
        link: 'Importing and exporting notes',
      },
    ],
    shortcutsTitle: 'System-wide shortcuts by default',
    shortcuts: [
      { keys: 'Ctrl+Alt+N', text: 'New note' },
      { keys: 'Ctrl+Alt+R', text: 'Voice note' },
      { keys: 'Ctrl+Alt+K', text: 'Search' },
      { keys: 'Ctrl+Alt+Space', text: 'Show or hide Fixnote' },
    ],
    installTitle: 'Installing and updates',
    install:
      'The .exe installer sets Fixnote up on Windows 10 and 11 (64-bit) and adds WebView2 if it is missing. After that the app updates itself. On first launch Windows may show SmartScreen: click “More info”, then “Run anyway”. A Microsoft Store version is on its way: the Store signs it, updates come through the Store, and it shares notes with the version from this site.',
    setup: 'How to install Fixnote',
    compareTitle: 'Fixnote and other note-taking apps',
    compareText:
      'How Fixnote differs from Notion, Obsidian, Evernote and Joplin on Windows, and what to use instead of Apple Notes when your computer is not a Mac.',
    faq: [
      {
        q: 'Does Windows have a notes app?',
        a: 'It has Notepad and Sticky Notes, which are enough for a line or two. Fixnote is for when notes pile up: folders, a daily note, search by meaning, an assistant that answers from your notes, and call summaries.',
      },
      {
        q: 'Is Fixnote for Windows free?',
        a: 'Yes. Everything that runs on your computer is free with no time limit: notes, search, dictation, call summaries with your own key or Ollama, MCP, import and export. Pro, at $7 a month, adds sync, Fixnote AI, shared notes and the Telegram bot.',
      },
      {
        q: 'Does Fixnote work on Windows 10?',
        a: 'Yes, on Windows 10 and 11, 64-bit. The installer adds WebView2, which the app’s window runs on, if it is missing.',
      },
      {
        q: 'Can I use Fixnote on both Windows and Mac?',
        a: 'Yes. There are apps for Windows and macOS and a web app. With Pro, notes sync between them end-to-end encrypted.',
      },
      {
        q: 'Does Fixnote work offline?',
        a: 'Yes. Notes are stored on your computer, and search and dictation run there too. You need the internet once to download the models, and for what goes through the server: sync and Fixnote AI.',
      },
    ],
  },

  notFound: {
    title: 'This page does not exist',
    text: 'The link may be outdated. Start from the home page.',
    home: 'Home',
  },
}
