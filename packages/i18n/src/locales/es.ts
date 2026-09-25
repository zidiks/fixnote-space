import type { LocaleResource } from './en'

const es: LocaleResource = {
  app: {
    name: 'FixNote',
  },
  sidebar: {
    search: 'Buscar',
    newNote: 'Nueva nota',
    inbox: 'Bandeja',
    daily: 'Hoy',
    recents: 'Recientes',
    folders: 'Carpetas',
    tags: 'Etiquetas',
    noFolders: 'Aún no hay carpetas. Las notas llegan a la Bandeja y la estructura viene después.',
    noTags: 'Escribe #etiqueta en una nota para crear una.',
    settings: 'Ajustes',
    collapse: 'Ocultar barra lateral',
    expand: 'Mostrar barra lateral',
  },
  home: {
    greeting: '¿Qué tienes en mente?',
    filters: {
      all: 'Todas',
      inbox: 'Bandeja',
      folder: 'Carpeta',
      type: 'Tipo',
      period: 'Periodo',
    },
    empty: {
      title: 'Aún no hay notas',
      body: 'Escribe o di lo que quieras abajo. Va a la Bandeja; puedes ordenarlo después, o nunca.',
    },
  },
  quickInput: {
    placeholder: 'Escribe cualquier cosa para empezar…',
    save: 'Guardar en Bandeja',
    ask: 'Preguntar',
    voice: 'Entrada de voz',
    attach: 'Adjuntar',
    hint: 'Enter para guardar · {{mod}}+Enter para preguntar',
  },
  chat: {
    title: 'Asistente',
    open: 'Abrir asistente',
    close: 'Cerrar asistente',
    scope: {
      label: 'Contexto',
      all: 'Todas las notas',
      folder: 'Carpeta: {{name}}',
      note: 'Nota: {{name}}',
      selection: 'Selección en {{name}}',
    },
    scopeChanged: 'Ahora en contexto: {{scope}}',
    placeholder: 'Pregunta sobre tus notas…',
    empty: 'Pregunta lo que quieras. Las respuestas citan las notas de origen.',
  },
  settings: {
    language: 'Idioma',
    theme: 'Tema',
    themes: {
      system: 'Sistema',
      light: 'Claro',
      dark: 'Oscuro',
    },
  },
  status: {
    offline: 'Sin conexión',
    notConfigured: 'Sincronización en la nube no configurada',
  },
}

export default es
