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
    open: 'Abrir',
    skip: 'Ir al contenido',
    language: 'Idioma',
  },

  hero: {
    eyebrow: 'Notas privadas con asistente',
    headline: [
      'Anota',
      { text: 'a tu manera', tone: 'brand' },
      '\n',
      'Encuentra',
      { text: 'al instante', tone: 'blue' },
    ],
    lead: 'Escríbelo, díctalo o envíalo por Telegram. Pregunta al asistente y te responde a partir de tus notas, citando las que usó. Todo se cifra en tu dispositivo.',
    download: 'Descargar',
    downloadFor: { mac: 'Descargar para macOS', windows: 'Descargar para Windows' },
    openWeb: 'Abrir en el navegador',
    platforms: 'Windows · macOS · Web',
    shotAlt:
      'FixNote: notas agrupadas por fecha y un asistente que responde con enlaces a las notas',
  },

  story: {
    label: 'Cómo se pierden las ideas',
    lines: [
      { text: 'Se te ocurrió una idea por el camino.' },
      { text: 'Te enviaste un audio por Telegram.', app: 'telegram' },
      { text: 'Luego apuntaste un par de cosas en el móvil.', emoji: '📱' },
      {
        text: 'Un mes después, la necesitas.',
        chip: { text: '¿Dónde lo apunté?', tone: 'blue', tilt: '-1.5deg' },
      },
      { text: 'Buscas «sorteo», pero escribiste «giveaway».', emoji: '🔍' },
      {
        text: 'Repasas chats, carpetas y capturas de pantalla.',
        chip: { text: 'Estaba por aquí…', tone: 'brand', tilt: '1.5deg' },
      },
    ],
    final: ['Las notas deberían', { text: 'recordar por ti', tone: 'brand', after: '.' }],
  },

  how: {
    eyebrow: 'Cómo funciona',
    headline: ['Tres pasos', '\n', 'de la idea a la', { text: 'respuesta', tone: 'brand' }],
    lead: 'Sin carpetas, etiquetas ni reglas al empezar. Ordena después: el asistente te sugerirá cómo.',
    step: 'Paso',
    steps: [
      {
        title: 'Anótalo como quieras.',
        text: 'Escribe, dicta o envía al bot de Telegram un texto, un audio o una foto. La voz se reconoce en tu propio dispositivo.',
      },
      {
        title: 'Pregunta con tus palabras.',
        text: 'El asistente busca por significado y por palabras en español, inglés y ruso, y responde con enlaces a las notas de las que sacó la respuesta.',
      },
      {
        title: 'Ordena con un clic.',
        text: 'FixNote sugiere títulos, carpetas y etiquetas y encuentra duplicados. Nada cambia sin tu confirmación y todo se puede deshacer.',
      },
    ],
    visual: {
      recording: 'Grabando',
      done: 'Listo',
      voice: 'Comprar leche y llamar a mamá el viernes',
      telegram: 'Idea: un bot que ordena las notas solo',
      question: '¿Qué decidí sobre las vacaciones?',
      answer:
        'En julio, en la playa: elegiste Portugal y dejaste la reserva para después de cobrar.',
      sources: 'Fuentes',
      source1: 'Vacaciones 2026',
      source2: 'Ideas para el verano',
      tidyTitle: 'Ordenar',
      tidyMove: 'Mover «Compras» a la carpeta «Casa»',
      tidyTitleSuggestion: 'Poner título: «Plan de la semana»',
      tidyMerge: 'Unir dos notas parecidas',
      accept: 'Aceptar',
    },
  },

  features: {
    eyebrow: 'Funciones',
    headline: ['Más que', { text: 'notas', tone: 'brand' }],
    lead: 'Todo para anotar rápido y encontrar aún más rápido.',
    more: 'Todas las funciones',
    cards: {
      search: {
        title: 'Búsqueda en tres idiomas',
        text: '«telegram» encuentra «телеграм», «sorteo» encuentra «giveaway». También aparecen notas parecidas en significado.',
      },
      voice: {
        title: 'Voz en el dispositivo',
        text: 'Dicta una idea y FixNote la transcribe localmente. La grabación no sale de tu dispositivo.',
      },
      assistant: {
        title: 'Respuestas con fuentes',
        text: 'Las respuestas salen solo de tus notas, con fuentes numeradas fáciles de comprobar.',
      },
      daily: {
        title: 'Nota del día',
        text: 'Una nota por día: pasa las tareas pendientes de ayer con un clic.',
      },
      telegram: {
        title: 'Bot de Telegram',
        text: 'Reenvía al bot textos, audios y fotos. Los cifra con tu clave, así que solo tu dispositivo puede leerlos.',
      },
      mcp: {
        title: 'Claude y Cursor',
        text: 'Servidor MCP integrado: Claude Desktop y Cursor buscan en tus notas y las amplían si lo permites.',
      },
    },
  },

  securityTeaser: {
    eyebrow: 'Privacidad',
    headline: ['El servidor ve', '\n', 'solo', { text: 'cifrado', tone: 'green' }],
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
    eyebrow: 'Ejemplos de preguntas',
    headline: ['Pregunta a', { text: 'tus notas', tone: 'blue' }],
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

  download: {
    eyebrow: 'Descargar',
    headline: ['Tus notas,', '\n', { text: 'en todas partes', tone: 'brand' }],
    lead: 'Apps para Windows y macOS y una versión web en el navegador. La sincronización entre dispositivos está cifrada de extremo a extremo.',
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
    eyebrow: 'FAQ',
    headline: ['Preguntas', '\n', 'y', { text: 'respuestas', tone: 'blue' }],
    items: [
      {
        q: '¿Necesito una cuenta?',
        a: 'No. FixNote funciona en tu dispositivo sin registrarte y sin internet. La cuenta solo hace falta para sincronizar entre dispositivos, para FixNote AI y para compartir enlaces a notas.',
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
        q: '¿Y si pierdo mi frase de 12 palabras?',
        a: 'En los dispositivos donde ya iniciaste sesión conservas tus notas, y desde ahí puedes añadir un dispositivo nuevo sin la frase. Si pierdes la frase y todos los dispositivos, nadie puede recuperar las notas, tampoco nosotros.',
      },
      {
        q: '¿Puedo traer mis notas de Notion, Bear u Obsidian?',
        a: 'Sí. La importación entiende una carpeta de Markdown (también Obsidian), una copia de Bear y una exportación de Notion, y conserva carpetas, etiquetas, fechas e imágenes. Puedes exportarlo todo a Markdown cuando quieras.',
      },
      {
        q: '¿En qué idiomas funciona FixNote?',
        a: 'La app está en español, inglés y ruso. La búsqueda y el asistente entienden notas que mezclan estos idiomas, incluida la transliteración y la jerga.',
      },
    ],
  },

  blogTeaser: {
    eyebrow: 'Blog',
    headline: ['Sobre la', { text: 'memoria', tone: 'green' }, 'y las notas'],
    all: 'Todos los artículos',
  },

  cta: {
    title: 'Apunta tu primera idea',
    lead: 'Descarga FixNote o ábrelo directamente en el navegador.',
    download: 'Descargar',
    open: 'Abrir en el navegador',
  },

  footer: {
    tagline: 'Notas privadas con un asistente que recuerda por ti.',
    product: 'Producto',
    resources: 'Recursos',
    webApp: 'Versión web',
    rss: 'RSS',
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
        text: 'Una nota diaria con tareas y navegación entre días: pasa las tareas pendientes de ayer con un clic. Cada pocos días, «Ordenar» sugiere títulos, carpetas y etiquetas y une duplicados.',
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
        text: 'La app de escritorio incluye un servidor MCP local. Conéctalo a Claude Desktop o Cursor con un clic y podrán buscar y leer tus notas, y con tu permiso crear notas nuevas.',
        points: [
          'Solo lectura por defecto',
          'Trabaja sobre la base local',
          'Configuración en un clic',
        ],
      },
      {
        id: 'import',
        title: 'Múdate, y vete cuando quieras',
        text: 'Importa una carpeta de Markdown u Obsidian, Bear o Notion con carpetas, etiquetas, fechas e imágenes. Exporta todas las notas a Markdown cuando quieras: tus datos son tuyos.',
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

  notFound: {
    title: 'Esta página no existe',
    text: 'Puede que el enlace esté desactualizado. Empieza por la página de inicio.',
    home: 'Inicio',
  },
}
