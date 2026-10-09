import type { Lang } from '../i18n'

/** One released version: its date and what changed for people, newest first. Empty notes mean only the site changed. */
export interface Release {
  version: string
  date: string
  notes: Record<Lang, readonly string[]>
}

export const RELEASES: readonly Release[] = [
  { version: '0.1.32', date: '2026-10-09', notes: { ru: [], en: [], es: [] } },
  {
    version: '0.1.31',
    date: '2026-10-02',
    notes: {
      ru: ['Пока Pro оплачен, оплату за него повторно открыть нельзя.'],
      en: ['While Pro is paid for, the app no longer opens a second checkout.'],
      es: ['Mientras Pro está pagado, la app ya no abre un segundo pago.'],
    },
  },
  {
    version: '0.1.30',
    date: '2026-10-02',
    notes: {
      ru: [
        'В настройках появился раздел «Подписка и оплата»: история платежей, чеки, переход на годовой план и отмена.',
      ],
      en: [
        'Settings now has a Billing section with your payments, receipts, a switch to yearly and cancelling.',
      ],
      es: [
        'Los ajustes tienen una sección Facturación con tus pagos, recibos, el cambio a anual y la cancelación.',
      ],
    },
  },
  {
    version: '0.1.29',
    date: '2026-10-02',
    notes: {
      ru: [
        'Синхронизация обращается к серверу намного реже: изменения с других устройств приходят сразу сами.',
        'Общая заметка, сохранённая с неверным ключом, теперь чинится сама.',
      ],
      en: [
        'Sync talks to the server far less often, because changes from other devices now arrive on their own.',
        'A shared note saved with the wrong key now repairs itself.',
      ],
      es: [
        'La sincronización consulta el servidor mucho menos, porque los cambios de otros dispositivos llegan solos.',
        'Una nota compartida guardada con la clave equivocada ahora se repara sola.',
      ],
    },
  },
  {
    version: '0.1.28',
    date: '2026-10-01',
    notes: {
      ru: [
        'После оплаты на сайте браузер возвращает вас в приложение для компьютера.',
        'При первом запуске приложение коротко показывает, с чего начать.',
        'Pro можно оплатить криптовалютой.',
      ],
      en: [
        'After paying on the site, the browser takes you back to the desktop app.',
        'On first launch a short welcome shows where to start.',
        'Pro can be paid for in crypto.',
      ],
      es: [
        'Después de pagar en el sitio, el navegador te devuelve a la app de escritorio.',
        'Al abrirla por primera vez, una bienvenida breve muestra por dónde empezar.',
        'Pro se puede pagar con criptomonedas.',
      ],
    },
  },
  {
    version: '0.1.27',
    date: '2026-10-01',
    notes: {
      ru: [
        'Несколько заметок можно выбрать долгим нажатием или с Ctrl и разом закрепить, перенести, разобрать или удалить.',
        'Время заметки меняется только вместе с её текстом и сохраняется при синхронизации.',
        'Итоги встреч на русском языке стали точнее.',
        'Все правки ИИ можно отклонить одной кнопкой.',
      ],
      en: [
        'Pick several notes with a long press or Ctrl-click, then pin, move, tidy up or delete them at once.',
        "A note's time changes only with its text and stays the same through sync.",
        'Summaries of meetings held in Russian are more accurate.',
        'One button rejects all of the AI’s suggested edits.',
      ],
      es: [
        'Elige varias notas con una pulsación larga o Ctrl y clic, y fíjalas, muévelas, ordénalas o bórralas a la vez.',
        'La hora de una nota solo cambia con su texto y se conserva al sincronizar.',
        'Los resúmenes de reuniones en ruso son más precisos.',
        'Un botón rechaza todas las ediciones propuestas por la IA.',
      ],
    },
  },
  {
    version: '0.1.26',
    date: '2026-10-01',
    notes: {
      ru: [
        'Повторный запуск открывает уже работающий FixNote, а не вторую копию.',
        'Из значка в трее можно создать заметку, начать голосовую, открыть заметку дня и поиск.',
      ],
      en: [
        'Launching FixNote again brings up the running app instead of a second copy.',
        'The tray icon creates a note, starts a voice note, opens today’s note and search.',
      ],
      es: [
        'Abrir FixNote otra vez muestra la app que ya está abierta en lugar de una segunda copia.',
        'El icono de la bandeja crea una nota, empieza una nota de voz, abre la nota de hoy y la búsqueda.',
      ],
    },
  },
  {
    version: '0.1.25',
    date: '2026-09-30',
    notes: {
      ru: [
        'Итоги созвонов работают на macOS 14.2 и новее.',
        'Закрытое окно прячется в трей или строку меню, и FixNote продолжает работать.',
        'В настройках видно, сколько места занимает каждая модель на устройстве.',
      ],
      en: [
        'Call summaries work on macOS 14.2 and later.',
        'Closing the window hides FixNote to the tray or menu bar, and it keeps running.',
        'Settings show how much space each on-device model takes.',
      ],
      es: [
        'Los resúmenes de llamadas funcionan en macOS 14.2 y posteriores.',
        'Cerrar la ventana oculta FixNote en la bandeja o la barra de menús, y sigue funcionando.',
        'Los ajustes muestran cuánto ocupa cada modelo del dispositivo.',
      ],
    },
  },
  {
    version: '0.1.24',
    date: '2026-09-30',
    notes: {
      ru: [
        'FixNote записывает созвон на Windows и делает из него заметку с итогами.',
        'Веб-версия удобна на телефоне: кнопка «Назад», раскладка под узкий экран, клавиатура iOS и значок на главном экране.',
      ],
      en: [
        'FixNote records a call on Windows and turns it into a note with a summary.',
        'The web app works well on phones: the back button, layouts for narrow screens, the iOS keyboard and a home screen icon.',
      ],
      es: [
        'FixNote graba una llamada en Windows y la convierte en una nota con resumen.',
        'La app web funciona bien en el móvil: el botón Atrás, diseños para pantallas estrechas, el teclado de iOS y un icono en la pantalla de inicio.',
      ],
    },
  },
  {
    version: '0.1.23',
    date: '2026-09-30',
    notes: {
      ru: ['Текст заметки, открытой по ссылке, можно выделить и скопировать.'],
      en: ['Text in a note opened from a share link can be selected and copied.'],
      es: ['El texto de una nota abierta desde un enlace se puede seleccionar y copiar.'],
    },
  },
  {
    version: '0.1.22',
    date: '2026-09-29',
    notes: {
      ru: [
        'Приложение открывается без вспышек и сразу в нужной теме.',
        'Свёрнутые папки остаются свёрнутыми после перезапуска.',
        'FixNote AI видит список папок и может глубже подумать над сложным вопросом.',
      ],
      en: [
        'The app opens without flashes and in the right theme straight away.',
        'Folded folders stay folded after a restart.',
        'FixNote AI sees your folders and can think longer about a hard question.',
      ],
      es: [
        'La app se abre sin destellos y con el tema correcto desde el principio.',
        'Las carpetas plegadas siguen plegadas tras reiniciar.',
        'FixNote AI ve tus carpetas y puede pensar más a fondo una pregunta difícil.',
      ],
    },
  },
  {
    version: '0.1.21',
    date: '2026-09-29',
    notes: {
      ru: [
        'Диктовка стала быстрее, и голос никогда не покидает устройство.',
        'Правки, которые делает подключённый по MCP ассистент, сразу видны в открытой общей заметке.',
      ],
      en: [
        'Dictation is faster, and your voice never leaves the device.',
        'Edits made by an assistant connected over MCP show up at once in an open shared note.',
      ],
      es: [
        'El dictado es más rápido y tu voz nunca sale del dispositivo.',
        'Las ediciones de un asistente conectado por MCP aparecen al momento en una nota compartida abierta.',
      ],
    },
  },
  {
    version: '0.1.20',
    date: '2026-09-29',
    notes: {
      ru: [
        'На Mac можно перенести заметки из Apple Notes вместе с папками.',
        'Поле ввода в чате с ассистентом растёт вместе с текстом.',
      ],
      en: [
        'On a Mac you can bring your notes over from Apple Notes, folders included.',
        'The assistant chat box grows with your text.',
      ],
      es: [
        'En el Mac puedes traer tus notas de Apple Notes, con sus carpetas.',
        'El cuadro del chat con el asistente crece con el texto.',
      ],
    },
  },
  {
    version: '0.1.19',
    date: '2026-09-29',
    notes: {
      ru: [
        'FixNote читает текст на картинках прямо на устройстве, и его находит поиск.',
        'Правка ИИ в открытой заметке впечатывается на месте, её видно по ходу.',
        'FixNote AI работает и в общих заметках.',
      ],
      en: [
        'FixNote reads the text in images on your device, and search finds it.',
        'An AI edit to an open note is typed in place, so you watch it happen.',
        'FixNote AI works in shared notes too.',
      ],
      es: [
        'FixNote lee el texto de las imágenes en tu dispositivo, y la búsqueda lo encuentra.',
        'Una edición de la IA en una nota abierta se escribe en su sitio, a la vista.',
        'FixNote AI también funciona en las notas compartidas.',
      ],
    },
  },
  {
    version: '0.1.18',
    date: '2026-09-29',
    notes: {
      ru: [
        'Ассистент сам ищет, создаёт и правит заметки, помнит разговор и даёт отменить все свои изменения сразу.',
        'Модели, которые работают на устройстве, собраны в Настройки → Дополнительно: размер, загрузка и удаление.',
        'Голосовые сообщения можно отправлять ассистенту в чат.',
      ],
      en: [
        'The assistant finds, creates and edits notes itself, remembers the conversation and can undo all its changes at once.',
        'On-device models are listed in Settings → Advanced with their size, download and remove.',
        'You can send the assistant voice messages in the chat.',
      ],
      es: [
        'El asistente busca, crea y edita notas por sí mismo, recuerda la conversación y deshace todos sus cambios a la vez.',
        'Los modelos del dispositivo aparecen en Ajustes → Avanzado con su tamaño, descarga y borrado.',
        'Puedes mandar mensajes de voz al asistente en el chat.',
      ],
    },
  },
  {
    version: '0.1.17',
    date: '2026-09-29',
    notes: {
      ru: [
        'Заметки устройства принадлежат одному аккаунту, а пробный Pro включается по вашему желанию.',
      ],
      en: ["A device's notes belong to one account, and the Pro trial starts when you choose."],
      es: [
        'Las notas de un dispositivo pertenecen a una cuenta, y la prueba de Pro empieza cuando tú quieras.',
      ],
    },
  },
  {
    version: '0.1.16',
    date: '2026-09-29',
    notes: {
      ru: ['При выходе из аккаунта FixNote спрашивает, что делать с заметками на устройстве.'],
      en: ['Signing out asks what to do with the notes on the device.'],
      es: ['Al cerrar sesión, FixNote pregunta qué hacer con las notas del dispositivo.'],
    },
  },
  {
    version: '0.1.15',
    date: '2026-09-29',
    notes: {
      ru: ['Pro можно оплатить и во время беты.'],
      en: ['Pro can be paid for during the beta too.'],
      es: ['Pro también se puede pagar durante la beta.'],
    },
  },
  {
    version: '0.1.14',
    date: '2026-09-28',
    notes: {
      ru: [
        'В общие заметки можно добавлять файлы и картинки.',
        'Заметки можно смотреть карточками, списком или компактно и сортировать.',
      ],
      en: [
        'Shared notes can hold files and images.',
        'Notes can be shown as cards, a list or a compact list, and sorted.',
      ],
      es: [
        'Las notas compartidas admiten archivos e imágenes.',
        'Las notas se pueden ver como tarjetas, lista o lista compacta, y ordenar.',
      ],
    },
  },
  {
    version: '0.1.13',
    date: '2026-09-28',
    notes: {
      ru: [
        'Появился Pro: 7 дней бесплатно, оплата в приложении.',
        'Ассистенты по MCP видят картинки и файлы заметок.',
        'Фраза восстановления показывается только после кода из письма.',
      ],
      en: [
        'Pro arrived, with a 7-day trial and payment in the app.',
        'Assistants connected over MCP see the images and files in notes.',
        'The recovery phrase shows only after a code sent to your email.',
      ],
      es: [
        'Llegó Pro, con 7 días de prueba y pago dentro de la app.',
        'Los asistentes conectados por MCP ven las imágenes y archivos de las notas.',
        'La frase de recuperación solo aparece tras un código enviado a tu correo.',
      ],
    },
  },
  {
    version: '0.1.12',
    date: '2026-09-28',
    notes: {
      ru: ['У каждого человека в общей заметке свой цвет.'],
      en: ['Each person in a shared note gets a colour of their own.'],
      es: ['Cada persona en una nota compartida tiene su propio color.'],
    },
  },
  {
    version: '0.1.11',
    date: '2026-09-28',
    notes: {
      ru: [
        'Кнопки, которые ждут сервер, показывают индикатор загрузки.',
        'Подключения к Telegram и ассистентам собраны в разделе «Интеграции».',
      ],
      en: [
        'Buttons that wait for the server show a spinner.',
        'Telegram and assistant connections live in a new Integrations section.',
      ],
      es: [
        'Los botones que esperan al servidor muestran un indicador de carga.',
        'Telegram y los asistentes se conectan desde una nueva sección Integraciones.',
      ],
    },
  },
  {
    version: '0.1.10',
    date: '2026-09-28',
    notes: {
      ru: [
        'Целыми папками можно делиться так же, как заметками.',
        'Приглашение нужно принять, и через 30 дней оно истекает.',
        'В общей заметке видно курсоры других людей.',
      ],
      en: [
        'Whole folders can be shared just like notes.',
        'An invitation has to be accepted and expires after 30 days.',
        'You see other people’s cursors in a shared note.',
      ],
      es: [
        'Se pueden compartir carpetas enteras igual que las notas.',
        'Una invitación hay que aceptarla y caduca a los 30 días.',
        'En una nota compartida ves los cursores de los demás.',
      ],
    },
  },
  {
    version: '0.1.9',
    date: '2026-09-28',
    notes: {
      ru: [
        'Заметкой можно поделиться с человеком по почте и редактировать её вместе в реальном времени.',
        'В узком окне FixNote перестраивается под ширину.',
      ],
      en: [
        'Share a note with someone by email and edit it together in real time.',
        'In a narrow window FixNote rearranges itself to fit.',
      ],
      es: [
        'Comparte una nota con alguien por correo y editadla juntos en tiempo real.',
        'En una ventana estrecha, FixNote se reorganiza para caber.',
      ],
    },
  },
  {
    version: '0.1.8',
    date: '2026-09-27',
    notes: {
      ru: ['Папка показывает и заметки из своих вложенных папок.'],
      en: ['A folder also shows the notes in its subfolders.'],
      es: ['Una carpeta muestra también las notas de sus subcarpetas.'],
    },
  },
  {
    version: '0.1.7',
    date: '2026-09-27',
    notes: {
      ru: [
        'Если одну заметку изменили на двух устройствах, FixNote сохраняет обе версии и даёт их сравнить.',
        'Две заметки дня за одну дату объединяются в одну.',
      ],
      en: [
        'When one note changes on two devices, FixNote keeps both versions and lets you compare them.',
        'Two daily notes for the same date are merged into one.',
      ],
      es: [
        'Si una nota cambia en dos dispositivos, FixNote guarda ambas versiones y te deja compararlas.',
        'Dos notas diarias de la misma fecha se unen en una.',
      ],
    },
  },
  {
    version: '0.1.6',
    date: '2026-09-27',
    notes: {
      ru: ['Таблицы видны в превью карточек.'],
      en: ['Tables show in note card previews.'],
      es: ['Las tablas se ven en la vista previa de las tarjetas.'],
    },
  },
  {
    version: '0.1.5',
    date: '2026-09-27',
    notes: {
      ru: [
        'В заметках появились таблицы.',
        'Новую заметку и папку можно создать сочетанием клавиш.',
        'FixNote подключается к Codex по MCP.',
      ],
      en: [
        'Notes can hold tables.',
        'Keyboard shortcuts create a new note and a new folder.',
        'FixNote connects to Codex over MCP.',
      ],
      es: [
        'Las notas admiten tablas.',
        'Hay atajos de teclado para crear una nota y una carpeta.',
        'FixNote se conecta a Codex por MCP.',
      ],
    },
  },
  {
    version: '0.1.4',
    date: '2026-09-27',
    notes: {
      ru: [
        'Ассистенты по MCP видят, какие задачи отмечены.',
        'Ссылки, присланные боту в Telegram, становятся карточками.',
      ],
      en: [
        'Assistants connected over MCP see which tasks are checked.',
        'Links sent to the Telegram bot become bookmark cards.',
      ],
      es: [
        'Los asistentes conectados por MCP ven qué tareas están marcadas.',
        'Los enlaces enviados al bot de Telegram se convierten en tarjetas.',
      ],
    },
  },
  {
    version: '0.1.3',
    date: '2026-09-27',
    notes: {
      ru: ['Поиск по смыслу больше не зависает.', 'На Mac файлы можно перетаскивать в окно.'],
      en: [
        'Search by meaning no longer gets stuck.',
        'On a Mac you can drop files onto the window.',
      ],
      es: [
        'La búsqueda por significado ya no se queda atascada.',
        'En el Mac puedes soltar archivos en la ventana.',
      ],
    },
  },
  {
    version: '0.1.2',
    date: '2026-09-27',
    notes: {
      ru: [
        'Повторяющиеся задачи сами появляются в заметке дня.',
        'Можно выбрать, вносит ли ИИ правки сразу или после вашего согласия.',
        'Файл, брошенный на окно, попадает в открытую заметку или в новую.',
      ],
      en: [
        'Repeating tasks appear in the daily note on their own.',
        'You choose whether the AI applies edits at once or after you accept them.',
        'A file dropped onto the window goes into the open note or a new one.',
      ],
      es: [
        'Las tareas repetidas aparecen solas en la nota diaria.',
        'Eliges si la IA aplica las ediciones al momento o después de que las aceptes.',
        'Un archivo soltado en la ventana va a la nota abierta o a una nueva.',
      ],
    },
  },
  {
    version: '0.1.1',
    date: '2026-09-27',
    notes: {
      ru: [
        'Приложение для компьютера обновляется само.',
        'Заметки можно закреплять, а в текст вставлять картинки.',
        'Ассистенты по MCP могут править, переносить и удалять заметки, а вы решаете, какие папки им видны.',
      ],
      en: [
        'The desktop app updates itself.',
        'Notes can be pinned, and images can be pasted into text.',
        'Assistants connected over MCP can edit, move and delete notes, and you choose which folders they see.',
      ],
      es: [
        'La app de escritorio se actualiza sola.',
        'Las notas se pueden fijar y se pueden pegar imágenes en el texto.',
        'Los asistentes conectados por MCP pueden editar, mover y borrar notas, y tú eliges qué carpetas ven.',
      ],
    },
  },
  {
    version: '0.1.0',
    date: '2026-09-26',
    notes: {
      ru: ['Первая версия FixNote для Windows, macOS и браузера.'],
      en: ['The first version of FixNote for Windows, macOS and the browser.'],
      es: ['La primera versión de FixNote para Windows, macOS y el navegador.'],
    },
  },
]
