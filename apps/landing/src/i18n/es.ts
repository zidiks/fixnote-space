import type { Dict } from './index'

export const es: Dict = {
  meta: {
    siteName: 'FixNote',
    home: {
      title: 'FixNote — notas privadas con un asistente que recuerda por ti',
      description:
        'Notas con cifrado de extremo a extremo para Windows, macOS y el navegador. Escribe o dicta, pregunta al asistente por tus notas y recibe respuestas que citan sus fuentes.',
    },
    features: {
      title: 'Funciones de FixNote: búsqueda en tres idiomas, voz, asistente, Telegram, MCP',
      description:
        'Búsqueda que entiende transliteración y sinónimos, dictado en el dispositivo, un asistente para tus notas, nota diaria e importación desde Notion, Bear y Obsidian.',
    },
    security: {
      title: 'Seguridad de FixNote: notas cifradas de extremo a extremo',
      description:
        'Cómo FixNote cifra las notas en tu dispositivo, qué guarda el servidor, qué ve el asistente y cómo trabajar totalmente sin conexión.',
    },
    privacy: {
      title: 'Política de privacidad de FixNote',
      description: 'Qué datos tiene FixNote, para qué los necesita y cómo borrarlos.',
    },
    download: {
      title: 'Descargar FixNote para Windows y macOS',
      description:
        'Instaladores de FixNote para Windows y macOS (Apple Silicon e Intel) y una versión web que funciona en el navegador.',
    },
    blog: {
      title: 'Blog de FixNote: notas, memoria y privacidad',
      description:
        'Cómo tomar notas que luego encuentras, cómo funciona el cifrado de extremo a extremo y cómo un asistente te ayuda a recordar.',
    },
    notFound: { title: 'Página no encontrada · FixNote', description: 'Esta página no existe.' },
  },

  nav: {
    home: 'Inicio',
    features: 'Funciones',
    security: 'Seguridad',
    blog: 'Blog',
    download: 'Descargar',
    pricing: 'Precios',
    faq: 'Preguntas',
    open: 'Abrir',
    skip: 'Ir al contenido',
    language: 'Idioma',
  },

  hero: {
    eyebrow: 'Notas privadas con asistente',
    subtitle: 'Anota a tu manera. Encuentra al instante.',
    lead: 'Escríbelo, díctalo o envíalo por Telegram. El asistente responde a partir de tus notas y muestra de dónde sacó cada respuesta. Todo se cifra en tu dispositivo.',
    download: 'Descargar',
    downloadFor: { mac: 'Descargar para macOS', windows: 'Descargar para Windows' },
    more: 'Más información',
    platforms: 'Windows, macOS y navegador · Gratis y sin cuenta',
    shotAlt:
      'FixNote: notas agrupadas por fecha y un asistente que responde con enlaces a las notas',
  },

  announce: {
    text: 'Nuevo: resúmenes de llamadas hechos en tu ordenador.',
    more: 'Más información',
  },

  tiles: {
    assistant: {
      eyebrow: 'FixNote AI',
      title: 'Pregunta a tus notas.\nObtén la respuesta.',
      text: 'El asistente busca por significado en tres idiomas y responde con enlaces a tus notas. Al modelo solo le llegan los fragmentos encontrados.',
      question: '¿Qué decidí sobre las vacaciones?',
      answer:
        'En julio, junto al mar: elegiste Portugal y dejaste la reserva para después de cobrar.',
      sources: 'Fuentes',
      source1: 'Vacaciones 2026',
      source2: 'Ideas para el verano',
    },
    voice: {
      eyebrow: 'Voz',
      title: 'Habla.\nEl texto aparece solo.',
      text: 'El dictado se reconoce en tu ordenador mientras hablas. La grabación no sale de él.',
      recording: 'Grabando',
      sample: 'Comprar leche y llamar a mamá el viernes',
    },
    telegram: {
      eyebrow: 'Telegram',
      title: 'Reenvíalo al bot.\nYa es una nota.',
      text: 'Textos, audios y fotos de Telegram se convierten en notas. El bot los sella con tu clave, y solo tu app puede leerlos.',
      message: 'Idea: un bot que ordena las notas solo',
      note: 'Desde Telegram',
    },
    search: {
      eyebrow: 'Búsqueda',
      title: 'Cualquier idioma.\nCualquier teclado.',
      text: '«sorteo» encuentra «giveaway», «телеграм» encuentra «Telegram». La búsqueda se abre desde cualquier sitio con Ctrl+K o ⌘K.',
      query: 'sorteo',
      result1: 'Giveaway en el canal: bases',
      result2: 'Sorteo de entradas, resultados',
      similar: 'Parecidas por significado',
      result3: 'Concurso para suscriptores',
    },
  },

  showcase: {
    headline: ['Llamadas, capturas, tareas.', '\n', 'Todo se vuelve una nota.'],
    call: {
      title: 'Llamada con Oleg',
      meta: '32 min · Yo y los demás',
      brief: 'Resumen',
      briefText: 'Hablamos del lanzamiento de la beta y del plan de artículos del blog.',
      decisions: 'Decisiones',
      decision: 'La beta sale el 15 de octubre.',
      tasks: 'Tareas',
      task1: 'Enviar a Oleg el plan de artículos',
      task2: 'Terminar la landing para el viernes',
      transcript: 'Transcripción',
    },
    items: [
      {
        id: 'calls',
        title: 'Resumen de llamadas',
        text: 'Tu micrófono y el sonido del ordenador se transcriben en el dispositivo durante la llamada. No se guarda audio.',
      },
      {
        id: 'ocr',
        title: 'Texto en imágenes',
        text: 'FixNote lee el texto de capturas y fotos, y la búsqueda las encuentra por sus palabras.',
      },
      {
        id: 'daily',
        title: 'Nota del día',
        text: 'Las tareas de hoy y las que se repiten. Lo pendiente de ayer pasa a hoy con un clic.',
      },
      {
        id: 'tidy',
        title: 'Poner orden',
        text: 'Propone títulos y carpetas y encuentra duplicados. Nada cambia sin que lo aceptes.',
      },
    ],
    more: 'Más información',
  },

  reasons: {
    headline: ['Más razones', '\n', 'para guardar tus notas aquí.'],
    items: [
      {
        id: 'edits',
        title: 'La IA edita solo\ncon tu permiso.',
        text: 'Los cambios se muestran palabra por palabra. Acéptalos, recházalos o deshazlos después.',
      },
      {
        id: 'shared',
        title: 'Notas y carpetas\ncompartidas.',
        text: 'Invita a otras personas por correo y editad juntos. Veis los cursores de los demás al momento.',
      },
      {
        id: 'links',
        title: 'Enlaces a notas que\nel servidor no puede leer.',
        text: 'La clave va después del «#» del enlace, y el navegador nunca envía esa parte al servidor.',
      },
      {
        id: 'mcp',
        title: 'Claude y Cursor\nven tus notas.',
        text: 'El servidor MCP integrado se conecta con un botón. Por defecto solo puede leer.',
      },
      {
        id: 'import',
        title: 'Muda tus notas desde\nNotion, Bear y Obsidian.',
        text: 'En Mac, también desde Apple Notes. Exporta todo a Markdown cuando quieras.',
      },
      {
        id: 'offline',
        title: 'Funciona\nsin internet.',
        text: 'Notas, búsqueda y voz funcionan sin conexión y sin cuenta. El asistente puede usar Ollama.',
      },
      {
        id: 'hotkeys',
        title: 'Atajos en cualquier\ndistribución de teclado.',
        text: 'Ctrl+K funciona también como Ctrl+Л: las teclas se reconocen por su posición.',
      },
    ],
    prev: 'Anterior',
    next: 'Siguiente',
  },

  securityTeaser: {
    eyebrow: 'Privacidad',
    headline: ['El servidor ve', '\n', 'solo texto cifrado.'],
    lead: 'Las notas se cifran en tu dispositivo con una clave que guardas como 12 palabras. La clave no sale de tus dispositivos, así que ni siquiera nosotros podemos leer tus notas.',
    points: [
      'Funciona sin cuenta y sin internet',
      'La voz se reconoce en tu dispositivo',
      'El asistente recibe solo los fragmentos encontrados',
      'Puede ser totalmente local, con Ollama',
    ],
    more: 'Cómo protegemos tus notas',
    plain: 'Comprar el regalo de cumpleaños de Ana',
  },

  questions: {
    headline: ['Pregunta a tus notas.'],
    lead: 'Como se lo preguntarías a alguien que ha leído todo lo que has apuntado.',
    top: [
      '¿Qué decidí sobre las vacaciones?',
      '¿Qué libros me recomendaron este año?',
      '¿Qué acordamos en la reunión con Oleg?',
      '¿Qué ideas tenía para el regalo de mamá?',
      '¿Qué escribí sobre la mudanza?',
      '¿Qué talla de zapatillas usaba el año pasado?',
    ],
    bottom: [
      'Reúne todas mis tareas de esta semana',
      '¿Qué aprendí sobre TypeScript este mes?',
      '¿Cuándo cambié el aceite del coche por última vez?',
      '¿Qué películas quería ver?',
      '¿Qué había en los audios de ayer?',
      'Resume mis notas sobre la reforma',
    ],
  },

  pricing: {
    headline: ['¿Qué plan', '\n', 'te conviene?'],
    lead: 'Todo lo que funciona en tu dispositivo es gratis y sin límite de tiempo. Pro añade lo que pasa por nuestro servidor.',
    included: 'Incluido',
    limited: 'Limitado',
    missing: 'No incluido',
    groups: [
      {
        title: 'En tu dispositivo',
        rows: [
          { label: 'Notas, carpetas y búsqueda', note: '', free: 'yes', pro: 'yes' },
          {
            label: 'Dictado y texto en imágenes',
            note: 'Se reconoce en el dispositivo',
            free: 'yes',
            pro: 'yes',
          },
          {
            label: 'Asistente con tu propia clave',
            note: 'OpenAI, OpenRouter, Groq, DeepSeek u Ollama',
            free: 'yes',
            pro: 'yes',
          },
          {
            label: 'MCP para Claude y Cursor',
            note: 'En la app de escritorio',
            free: 'yes',
            pro: 'yes',
          },
          { label: 'Importar y exportar a Markdown', note: '', free: 'yes', pro: 'yes' },
        ],
      },
      {
        title: 'A través del servidor',
        rows: [
          {
            label: 'Sincronización entre dispositivos',
            note: 'En Free los cambios solo se descargan',
            free: 'part',
            pro: 'yes',
          },
          { label: 'Asistente FixNote AI', note: 'Con un límite mensual', free: 'no', pro: 'yes' },
          {
            label: 'Notas y carpetas compartidas',
            note: 'Los invitados no necesitan Pro',
            free: 'no',
            pro: 'yes',
          },
          { label: 'Enlaces a notas', note: '', free: 'no', pro: 'yes' },
          { label: 'Bot de Telegram', note: '', free: 'no', pro: 'yes' },
          { label: 'Imágenes y archivos en el servidor', note: '20 GB', free: 'no', pro: 'yes' },
        ],
      },
    ],
    free: {
      name: 'Free',
      price: '0 $',
      period: 'Sin límite de tiempo',
      text: 'Todo en tu dispositivo. Sin cuenta.',
      button: 'Descargar',
    },
    pro: {
      name: 'Pro',
      price: '7 $',
      period: 'al mes, o 60 $ al año',
      text: '7 días gratis, sin tarjeta.',
      button: 'Probar',
    },
    prices: 'Precios en dólares estadounidenses, pago a través de Suby.',
  },

  steps: {
    headline: ['Listo en un minuto.'],
    items: [
      {
        title: 'Descarga',
        text: 'El instalador para Windows o macOS. O abre la versión web en el navegador.',
      },
      {
        title: 'Escribe',
        text: 'La primera nota no necesita registro. La cuenta solo hace falta para sincronizar y para Pro.',
      },
      {
        title: 'Encuentra',
        text: 'Ctrl+K encuentra una nota por cualquier palabra, y el asistente responde preguntas sobre lo que escribiste.',
      },
    ],
    all: 'Todos los instaladores',
  },

  download: {
    windows: { name: 'Windows', detail: 'Windows 10 y 11, 64 bits', button: 'Descargar .exe' },
    macArm: {
      name: 'macOS · Apple Silicon',
      detail: 'Mac con M1 o posterior',
      button: 'Descargar .dmg',
    },
    macIntel: {
      name: 'macOS · Intel',
      detail: 'Mac con procesador Intel',
      button: 'Descargar .dmg',
    },
    web: { name: 'Versión web', detail: 'Chrome, Edge, Safari, Firefox', button: 'Abrir' },
    macNoteTitle: 'Primer inicio en Mac',
    macNote:
      'Mientras la app no esté notarizada por Apple, macOS puede decir que está dañada. Arrastra FixNote a Aplicaciones y ejecuta esto una vez en Terminal:',
    windowsNoteTitle: 'Primer inicio en Windows',
    windowsNote:
      'Windows puede mostrar un aviso de SmartScreen: pulsa «Más información» y luego «Ejecutar de todas formas». El instalador firmado llegará más adelante.',
  },

  faq: {
    headline: ['¿Preguntas? Respuestas.'],
    items: [
      {
        q: '¿Necesito una cuenta?',
        a: 'No. FixNote funciona en tu dispositivo sin registrarte y sin internet. La cuenta solo hace falta para Pro: sincronizar entre dispositivos, FixNote AI, notas compartidas y enlaces.',
      },
      {
        q: '¿Quién puede leer mis notas?',
        a: 'Solo tú. Las notas se cifran en tu dispositivo con una clave que guardas tú: en el llavero del sistema y en tu frase de recuperación de 12 palabras. El servidor solo guarda texto cifrado.',
      },
      {
        q: '¿Qué ve el asistente?',
        a: 'Solo los fragmentos encontrados para cada pregunta, nunca toda tu biblioteca. Puedes usar tu propia clave de OpenAI, OpenRouter, Groq o DeepSeek, u Ollama en tu ordenador, y entonces nada sale a internet.',
      },
      {
        q: '¿Cuánto cuesta FixNote?',
        a: 'Todo lo que funciona en tu dispositivo es gratis y sin límite de tiempo. Pro cuesta 7 $ al mes o 60 $ al año, y puedes probarlo 7 días sin tarjeta.',
      },
      {
        q: '¿Qué pasa con mis notas cuando termina Pro?',
        a: 'Se quedan en tus dispositivos. La sincronización solo descarga cambios, y lo demás que pasa por el servidor se desactiva hasta que renueves.',
      },
      {
        q: '¿Y si pierdo mi frase de 12 palabras?',
        a: 'En los dispositivos donde ya iniciaste sesión conservas tus notas, y desde ahí puedes añadir un dispositivo nuevo sin la frase. Si pierdes la frase y todos los dispositivos, nadie puede recuperar las notas, tampoco nosotros.',
      },
      {
        q: '¿Puedo traer mis notas de Notion, Bear u Obsidian?',
        a: 'Sí. La importación entiende una carpeta de Markdown (también Obsidian), una copia de Bear y una exportación de Notion, y conserva carpetas, fechas e imágenes. En Mac también puedes traer Apple Notes. Puedes exportarlo todo a Markdown cuando quieras.',
      },
      {
        q: '¿En qué idiomas funciona FixNote?',
        a: 'La app está en español, inglés y ruso. La búsqueda y el asistente entienden notas que mezclan estos idiomas, incluida la transliteración y la jerga.',
      },
    ],
  },

  blogTeaser: {
    headline: ['Del blog.'],
    lead: 'Cómo funciona FixNote y cómo tomar notas que luego encuentres.',
    all: 'Todos los artículos',
  },

  cta: {
    title: 'Apunta tu primera idea.',
    lead: 'Descarga FixNote o ábrelo directamente en el navegador.',
    download: 'Descargar',
    open: 'Abrir en el navegador',
  },

  notes: [
    'Free funciona sin cuenta y sin límite de tiempo. La cuenta hace falta para Pro: sincronización, FixNote AI, notas compartidas, enlaces, el bot de Telegram y archivos en el servidor.',
    'La búsqueda funciona en tu dispositivo. Con FixNote AI, la pregunta y los fragmentos encontrados pasan por nuestro servidor hasta el proveedor del modelo y no se guardan. Con tu propia clave, las peticiones van directamente al servicio que elegiste; con Ollama se quedan en tu ordenador.',
    'El resumen de llamadas está en la app para Windows y para macOS 14.2 o posterior.',
    'La prueba de Pro se activa en la app después de iniciar sesión. Sin tarjeta; al terminar la semana, la cuenta vuelve a Free si no te suscribes.',
  ],

  footer: {
    tagline: 'Notas privadas con asistente.',
    product: 'Producto',
    resources: 'Recursos',
    company: 'FixNote',
    webApp: 'Versión web',
    rss: 'RSS',
    privacy: 'Privacidad',
    rights: 'FixNote',
  },

  featuresPage: {
    eyebrow: 'Funciones',
    headline: ['Todo lo que tu', '\n', { text: 'memoria', tone: 'brand' }, 'necesita'],
    lead: 'FixNote reúne ideas de cualquier sitio y te ayuda a encontrarlas cuando importan.',
    sections: [
      {
        id: 'search',
        title: 'Una búsqueda que entiende lo que quisiste decir',
        text: 'La búsqueda encuentra palabras escritas con cualquier distribución de teclado y en transliteración: «telegram» encuentra «телеграм». El asistente añade traducciones y sinónimos a tu consulta, así que «sorteos» encuentra una nota sobre un «giveaway». Y si no coincide ninguna palabra, FixNote muestra notas parecidas en significado.',
        points: [
          'Español, inglés y ruso mezclados',
          'Coincidencias resaltadas en el texto',
          'Mod+K desde cualquier sitio',
        ],
      },
      {
        id: 'assistant',
        title: 'Un asistente que responde con tus notas',
        text: 'Pregunta «¿qué decidí sobre las vacaciones?» y el asistente encuentra las notas adecuadas y responde con fuentes numeradas. Su contexto sigue lo que tienes abierto: una nota, una carpeta o todo.',
        points: [
          'Respuestas con enlaces a tus notas',
          'FixNote AI, tu propia clave u Ollama',
          'Solo se envían los fragmentos encontrados',
        ],
      },
      {
        id: 'voice',
        title: 'Voz que no sale de tu dispositivo',
        text: 'Dicta una nota nueva, la continuación de una abierta o una pregunta al asistente. El reconocimiento (Whisper) funciona en tu ordenador; el modelo se descarga una vez.',
        points: [
          'Atajo Mod+Shift+Space',
          'Funciona sin conexión',
          'Puede añadirse a la nota del día',
        ],
      },
      {
        id: 'edit',
        title: 'Cambios de IA solo si tú lo dices',
        text: 'Selecciona texto y pide acortarlo, reescribirlo, corregir errores u ordenar un apunte caótico. Los cambios se muestran palabra por palabra: acéptalos o recházalos. Cada cambio de la IA queda en los ajustes y se puede deshacer.',
        points: [
          'Antes y después palabra por palabra',
          'Se deshace en un paso',
          'Historial de cambios de IA',
        ],
      },
      {
        id: 'daily',
        title: 'Nota diaria y orden sin esfuerzo',
        text: 'Una nota diaria con tareas y navegación entre días: pasa las tareas pendientes de ayer con un clic. Cada pocos días, «Ordenar» sugiere títulos y carpetas y une duplicados.',
        points: [
          'Pasar tareas, con confirmación',
          'Notas agrupadas por fecha',
          'Todo se puede deshacer',
        ],
      },
      {
        id: 'capture',
        title: 'Telegram, imágenes y enlaces',
        text: 'Envía al bot de Telegram un mensaje, un audio o una foto y se convierte en nota. Un enlace pegado se vuelve una tarjeta con título e imagen; las imágenes se comprimen y se sincronizan cifradas.',
        points: [
          'Audios transcritos en tu dispositivo',
          'Tarjetas de enlaces',
          'Imágenes de hasta 20 MB',
        ],
      },
      {
        id: 'mcp',
        title: 'Claude, Cursor y otros clientes MCP',
        text: 'La app de escritorio incluye un servidor MCP local. Conéctalo a Claude Desktop o Cursor con un clic y podrán buscar y leer tus notas, ver sus imágenes y archivos, y con tu permiso crear notas nuevas y adjuntar archivos.',
        points: [
          'Solo lectura por defecto',
          'Trabaja sobre la base local',
          'Configuración en un clic',
        ],
      },
      {
        id: 'import',
        title: 'Múdate, y vete cuando quieras',
        text: 'Importa una carpeta de Markdown u Obsidian, Bear o Notion con carpetas, fechas e imágenes. Exporta todas las notas a Markdown cuando quieras: tus datos son tuyos.',
        points: [
          'Notion, Bear, Obsidian, Markdown',
          'Reimportar sin duplicados',
          'Exportar a Markdown',
        ],
      },
    ],
  },

  securityPage: {
    eyebrow: 'Seguridad',
    headline: ['Tus notas', '\n', 'solo las lees', { text: 'tú', tone: 'green' }],
    lead: 'FixNote está hecho para que no tengas que confiar en nosotros: el cifrado ocurre en tu dispositivo y el servidor solo guarda lo que no puede leer.',
    sections: [
      {
        title: 'Cifrado en tu dispositivo',
        text: 'Al crear la cuenta, FixNote genera una clave aleatoria y te la muestra como 12 palabras. Cada nota se cifra en el dispositivo (XChaCha20-Poly1305) con una clave nueva, envuelta con la clave de tu cuenta. El cifrado está ligado a su nota, así que el servidor no puede cambiar una nota por otra.',
      },
      {
        title: 'Qué guarda el servidor',
        text: 'Notas, carpetas y adjuntos cifrados, lo que la sincronización necesita (números de versión, fechas de creación y edición, qué nota es la del día) y tu correo para los códigos de acceso. El texto de las notas, los nombres de carpetas y las imágenes nunca están legibles en el servidor.',
      },
      {
        title: 'Qué ve el asistente',
        text: 'La búsqueda en tus notas ocurre en tu dispositivo. Al modelo de lenguaje solo se envían los fragmentos encontrados para tu pregunta. Elige FixNote AI, tu propia clave (OpenAI, OpenRouter, Groq, DeepSeek) u Ollama en tu ordenador, y entonces nada sale a internet.',
      },
      {
        title: 'Voz y Telegram',
        text: 'La voz la reconoce un modelo Whisper en tu propio dispositivo. El bot de Telegram nunca guarda mensajes legibles: los sella al instante con tu clave pública y solo tu app puede abrirlos.',
      },
      {
        title: 'Un dispositivo nuevo sin escribir la frase',
        text: 'Puedes añadir un dispositivo nuevo desde uno en el que ya iniciaste sesión: ambas pantallas muestran el mismo código de seis cifras y la clave va, cifrada, solo al dispositivo nuevo.',
      },
      {
        title: 'Enlaces a notas',
        text: 'Cuando compartes una nota, la copia se cifra con una clave que vive solo en la parte del enlace tras «#». Los navegadores nunca envían esa parte a un servidor, así que el servidor guarda una copia que no puede leer. Puedes desactivar el enlace cuando quieras.',
      },
      {
        title: 'Totalmente local',
        text: 'FixNote funciona sin cuenta y sin internet. El modo solo local desactiva la sincronización, Telegram y los enlaces, y el asistente usa solo Ollama en tu ordenador.',
      },
    ],
    stored: 'Así guarda el servidor una nota',
  },

  downloadPage: {
    eyebrow: 'Descargar',
    headline: ['FixNote para', { text: 'tus', tone: 'brand' }, 'dispositivos'],
    lead: 'Elige el instalador para tu sistema o abre la versión web. Al iniciar sesión, las notas se sincronizan entre todos tus dispositivos.',
    requirementsTitle: 'Requisitos del sistema',
    requirements: [
      'Windows 10 u 11 (64 bits); WebView2 se instala automáticamente',
      'macOS 11 Big Sur o posterior',
      'Para el dictado: unos 80 MB para el modelo de voz',
      'Para la búsqueda por significado: unos 120 MB para el modelo de lenguaje',
    ],
  },

  blogPage: {
    more: 'Más artículos',
    eyebrow: 'Blog',
    headline: ['Notas', { text: 'sobre notas', tone: 'brand' }],
    lead: 'Cómo apuntar ideas para encontrarlas después, y cómo funciona FixNote por dentro.',
    read: 'Leer',
    minutes: 'min',
    back: 'Todos los artículos',
    published: 'Publicado',
    empty: 'Pronto habrá artículos aquí.',
    otherLanguages: 'Este artículo en otros idiomas',
  },

  privacyPage: {
    eyebrow: 'Privacidad',
    title: 'Política de privacidad',
    updated: 'Actualizada el 28 de septiembre de 2026',
    lead: 'En resumen: no podemos leer tus notas, no vendemos datos y no mostramos anuncios. A continuación, qué datos tiene FixNote y para qué.',
    sections: [
      {
        title: 'Sin cuenta',
        text: [
          'FixNote funciona sin cuenta. En ese caso tus notas, adjuntos y ajustes se quedan solo en tu dispositivo. En el modo «solo local» la app no se conecta a nuestro servidor en absoluto.',
        ],
      },
      {
        title: 'Cuenta',
        text: [
          'Para entrar hace falta un correo, al que enviamos un código. Guardamos la dirección, la clave pública de tu cuenta (para que puedan enviarte invitaciones y mensajes de Telegram) y los datos de sesión que te mantienen conectado.',
        ],
      },
      {
        title: 'Notas y sincronización',
        text: [
          'Las notas, carpetas y adjuntos se cifran en tu dispositivo con una clave que solo tienes tú. El servidor los guarda cifrados, junto con datos de sincronización: números de versión, fechas de creación y edición y si una nota es la nota del día. No podemos leer el contenido.',
        ],
      },
      {
        title: 'Notas y carpetas compartidas',
        text: [
          'Cuando invitas a alguien, guardamos su correo, su rol y la fecha de la invitación. Los miembros ven las direcciones de los demás. El texto de las notas, los nombres de las carpetas y las imágenes y archivos de las notas compartidas se cifran con una clave que solo tienen los miembros. Los cambios en la edición conjunta también pasan cifrados por el servidor.',
        ],
      },
      {
        title: 'Enlaces a notas',
        text: [
          'La copia de una nota enlazada se cifra con una clave que va en la parte del enlace después de «#». Los navegadores no envían esa parte al servidor, así que guardamos una copia que no podemos leer. Puedes desactivar el enlace cuando quieras.',
        ],
      },
      {
        title: 'Asistente',
        text: [
          'La búsqueda en tus notas funciona en tu dispositivo. Cuando preguntas a FixNote AI, tu pregunta y los fragmentos encontrados pasan por nuestro servidor a un proveedor de modelos de lenguaje para obtener la respuesta. No guardamos ni registramos el contenido de estas solicitudes.',
          'Con tu propia clave, las solicitudes van directamente al servicio que elegiste y siguen sus condiciones. Con Ollama todo se queda en tu ordenador.',
        ],
      },
      {
        title: 'Voz',
        text: ['La voz se reconoce en tu dispositivo. La grabación no se envía a ninguna parte.'],
      },
      {
        title: 'Telegram',
        text: [
          'Si conectas el bot, los mensajes nos llegan desde Telegram y se sellan al instante con tu clave pública. Los guardamos sellados hasta que tu app los recoge, y guardamos el vínculo entre tu cuenta y el chat. Telegram trata los mensajes según sus propias condiciones.',
        ],
      },
      {
        title: 'Otros servicios',
        text: [
          'Los datos de la cuenta y las notas cifradas se guardan en Supabase, y los correos con el código los envía Resend. Los pagos de Pro los gestiona Suby: recibimos el estado de la suscripción, nunca la tarjeta.',
          'La app descarga sus modelos de búsqueda y de voz desde Hugging Face. Las tarjetas de enlaces en el navegador se obtienen a través de nuestro servidor (sin registrar las direcciones) y directamente en la app de escritorio. La app de escritorio busca actualizaciones en fixnote.space y GitHub; la versión de Microsoft Store las recibe desde la Store.',
        ],
      },
      {
        title: 'Publicidad y seguimiento',
        text: [
          'No hay anuncios, analíticas ni rastreadores en la app ni en el sitio. No vendemos datos ni los compartimos con fines publicitarios.',
        ],
      },
      {
        title: 'Conservación y borrado',
        text: [
          'Guardamos tus datos mientras tengas una cuenta. Puedes exportar tus notas cuando quieras: Ajustes → Datos.',
          'Una excepción: si una cuenta nunca ha pagado Pro, la copia de sus imágenes y archivos en el servidor se elimina 90 días después de que termine su prueba de Pro. La app avisa un mes antes y guarda los archivos en tus dispositivos. A quien ha pagado no se le elimina nada.',
          'Para borrar tu cuenta y todo lo vinculado a ella en el servidor, escríbenos desde la dirección con la que entras. Borramos los datos en un plazo de 30 días. Las notas en tus dispositivos se quedan contigo.',
        ],
      },
      {
        title: 'Menores',
        text: [
          'FixNote no está pensado para menores de 13 años, y no recopilamos sus datos a sabiendas.',
        ],
      },
      {
        title: 'Cambios',
        text: ['Si esta política cambia, actualizaremos esta página y la fecha de arriba.'],
      },
    ],
    contact: 'Preguntas sobre tus datos y solicitudes de borrado:',
  },

  notFound: {
    title: 'Esta página no existe',
    text: 'Puede que el enlace esté desactualizado. Empieza por la página de inicio.',
    home: 'Inicio',
  },
}
