import type { LocaleResource } from './en'

const ru: LocaleResource = {
  app: {
    name: 'FixNote',
  },
  sidebar: {
    search: 'Поиск',
    newNote: 'Новая заметка',
    inbox: 'Входящие',
    daily: 'Сегодня',
    recents: 'Недавние',
    folders: 'Папки',
    tags: 'Теги',
    noFolders: 'Папок пока нет. Заметки попадают во Входящие, структура появится позже.',
    noTags: 'Напишите #тег в заметке, чтобы создать его.',
    settings: 'Настройки',
    collapse: 'Скрыть боковую панель',
    expand: 'Показать боковую панель',
  },
  home: {
    greeting: 'О чём думаете?',
    filters: {
      all: 'Все',
      inbox: 'Входящие',
      folder: 'Папка',
      type: 'Тип',
      period: 'Период',
    },
    empty: {
      title: 'Заметок пока нет',
      body: 'Напишите или наговорите что угодно ниже. Всё попадёт во Входящие, разобрать можно потом или никогда.',
    },
  },
  quickInput: {
    placeholder: 'Напишите что-нибудь, чтобы начать…',
    save: 'Сохранить во Входящие',
    ask: 'Спросить',
    voice: 'Голосовой ввод',
    attach: 'Прикрепить',
    hint: 'Enter — сохранить · {{mod}}+Enter — спросить',
  },
  chat: {
    title: 'Ассистент',
    open: 'Открыть ассистента',
    close: 'Закрыть ассистента',
    scope: {
      label: 'Контекст',
      all: 'Все заметки',
      folder: 'Папка: {{name}}',
      note: 'Заметка: {{name}}',
      selection: 'Выделение в {{name}}',
    },
    scopeChanged: 'Теперь в контексте: {{scope}}',
    placeholder: 'Спросите о своих заметках…',
    empty: 'Спрашивайте что угодно. Ответы ссылаются на заметки-источники.',
  },
  settings: {
    language: 'Язык',
    theme: 'Тема',
    themes: {
      system: 'Системная',
      light: 'Светлая',
      dark: 'Тёмная',
    },
  },
  status: {
    offline: 'Нет сети',
    notConfigured: 'Облачная синхронизация не настроена',
  },
}

export default ru
