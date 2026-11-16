/**
 * Demo content for capturing FixNote screens into Figma (tools/figma-bridge/fixnote/screens.md):
 * folders, notes with headings, tasks, links, a call note, daily notes, a saved link and a picture.
 * Runs in the app's own page (`pnpm dev`, `?dev-backend`), through the app's database:
 *
 *   const seed = await import('/@fs/<repo>/tools/figma-bridge/fixnote/seed.js')
 *   await seed.seed()      // once; then reload the page
 *
 * It writes through NotesRepo like the app. Seeding twice does nothing (it looks for its first note).
 */

const MARK = 'План запуска FixNote 2.0'
const DAY = 86_400_000

const iso = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A small landscape picture drawn here, so no file is needed. */
async function picture() {
  const c = new OffscreenCanvas(960, 600)
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, 600)
  sky.addColorStop(0, '#f7b267')
  sky.addColorStop(0.55, '#f4845f')
  sky.addColorStop(1, '#7b4b94')
  g.fillStyle = sky
  g.fillRect(0, 0, 960, 600)
  g.fillStyle = '#ffe8c2'
  g.beginPath()
  g.arc(640, 300, 70, 0, Math.PI * 2)
  g.fill()
  const hills = [
    ['#5b3a72', 360, [0, 420, 180, 330, 360, 400, 560, 300, 760, 390, 960, 320]],
    ['#3e2a52', 440, [0, 480, 220, 410, 470, 470, 700, 400, 960, 460]],
    ['#24183a', 520, [0, 540, 300, 500, 620, 550, 960, 510]],
  ]
  for (const [color, , pts] of hills) {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, 600)
    for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
    g.lineTo(960, 600)
    g.closePath()
    g.fill()
  }
  return c.convertToBlob({ type: 'image/png' })
}

export async function seed() {
  // An import Vite cannot rewrite: the app's own module, so the app's own database connection.
  const { openDb } = await new Function('p', 'return import(p)')('/src/lib/db.tsx')
  const { repo, attachments } = await openDb()
  const existing = await repo.search(MARK, { limit: 1 }).catch(() => [])
  if ((existing.items ?? existing).length) return 'already seeded'

  const now = Date.now()
  const at = (days, hours = 0) => now - days * DAY - hours * 3_600_000
  const folder = (name, parent = null) => repo.createFolder(name, parent)
  const note = (content, folderId, updated, extra = {}) =>
    repo.createNote({ content, folderId, createdAt: updated - DAY, updatedAt: updated, ...extra })

  const work = await folder('Работа')
  const projects = await folder('Проекты', work.id)
  const meetings = await folder('Встречи', work.id)
  const personal = await folder('Личное')
  const ideas = await folder('Идеи')
  const reading = await folder('Чтение')
  const links = await folder('Links')
  const design = await folder('Дизайн', links.id)
  const dev = await folder('Разработка', links.id)

  const plan = await note(
    `# ${MARK}

Цель: выпустить новую версию **до 1 декабря** и подключить первых 500 платящих пользователей.

## Задачи

- [x] Собрать отзывы бета-тестеров
- [x] Переделать онбординг: выбор вида при первом запуске
- [ ] Обновить лендинг и цены
- [ ] Записать демо-видео на 60 секунд
- [ ] Подготовить пост для Product Hunt

## Риски

1. Синхронизация больших заметок на медленном интернете
2. Модерация расширения в Chrome Web Store может занять неделю

Подробности в [документе с метриками](https://fixnote.space/blog).
`,
    projects.id,
    at(0, 1),
  )
  await repo.setPinned(plan.id, true)

  await note(
    `# Созвон с командой дизайна

## Кратко

Обсудили новый вид «как заметки» и тёмную тему. Сайдбар остаётся, колонку заметок можно сужать.

## Решения

- Карточки в колонке делаем компактными: заголовок, две строки текста и дата
- Тёмную тему выпускаем вместе с новым видом

## Задачи

- [ ] Аня: макеты колонки к пятнице
- [ ] Илья: проверить контраст в тёмной теме

<details>
<summary>Расшифровка</summary>

**Я, 0:04.** Давайте начнём с колонки заметок, там больше всего вопросов.

**Участники, 0:12.** Мне кажется, превью картинки в карточке лишнее, оно съедает место.

**Я, 0:31.** Согласен, оставим заголовок, две строки и дату.

</details>
`,
    meetings.id,
    at(0, 3),
  )

  await note(
    `# Ретро спринта 45

Что получилось: релиз расширения, починили дубли ежедневных заметок.

Что улучшить:
- раньше замораживать задачи на релиз
- писать в changelog сразу, а не в конце
`,
    meetings.id,
    at(2),
  )

  await note(
    `# Идеи для блога

- Как я веду заметки с голосом и не трачу время на расшифровку
- 5 способов разобрать «Входящие» за 10 минут
- Сравнение: Bear, Apple Notes и FixNote
- Почему заметки должны жить на вашем устройстве
`,
    ideas.id,
    at(1, 2),
  )
  await repo.setPinned(
    (
      await note(
        '# Название для фичи\n\nВместо «Навести порядок» — «Разобрать». Проверить на пяти людях.\n',
        ideas.id,
        at(4),
      )
    ).id,
    true,
  )

  await note(
    `# Список покупок

- [ ] Молоко овсяное
- [ ] Хлеб
- [x] Кофе в зёрнах
- [ ] Батарейки AA
- [ ] Подарок Маше на день рождения
`,
    personal.id,
    at(0, 5),
  )

  await note(
    `# Тренировки

Понедельник и четверг — зал, суббота — бег 5 км.

- [ ] Купить новые кроссовки
- [ ] Записаться к тренеру на технику бега
`,
    personal.id,
    at(6),
  )

  await note(
    `# Книги на зиму

1. «Атлант расправил плечи» — Айн Рэнд
2. «Думай медленно… решай быстро» — Даниэль Канеман
3. «Проект „Аве Мария“» — Энди Вейер
4. «Как работать по 4 часа в неделю» — Тим Феррис

Начать с Вейера: короткая и лёгкая.
`,
    reading.id,
    at(3),
  )

  const img = await picture()
  const pic = await attachments.add(img, 'image/png')
  await note(
    `# Поездка в горы

Снято на перевале перед закатом. Нужно распечатать для календаря.

![](attachment:${pic.id})

Маршрут: Сочи → Красная Поляна → Роза Хутор, 3 дня.
`,
    personal.id,
    at(1, 6),
  )

  await note(
    `# Linear — The system for product development
https://linear.app/

Linear streamlines issues, projects, and product roadmaps. Purpose-built for modern product teams.
`,
    dev.id,
    at(1, 1),
  )
  await note(
    `# Refactoring UI
https://refactoringui.com/

Learn how to design awesome UIs by yourself using specific tactics explained from a developer's point-of-view.
`,
    design.id,
    at(2, 4),
  )
  await note(
    `# Radix Primitives
https://www.radix-ui.com/primitives

An open-source UI component library for building high-quality, accessible design systems and web apps.
`,
    dev.id,
    at(5),
  )

  await note('Позвонить в сервис насчёт стиральной машины, номер заявки 48213.\n', null, at(0, 2))
  await note(
    '# Мысль\n\nЛучшее время для заметок — сразу после встречи, пока всё свежее. Голосом быстрее, чем набирать.\n',
    null,
    at(1, 4),
  )
  await note(
    'Пароль от Wi-Fi в коворкинге: спросить у администратора на втором этаже\n',
    null,
    at(3, 3),
  )

  const today = iso(now)
  const yesterday = iso(now - DAY)
  await repo.createNote({
    type: 'daily',
    dailyDate: yesterday,
    content: `# ${new Date(now - DAY).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}

- [x] Отправить счёт клиенту
- [x] Ревью pull request с расширением
- [ ] Позвонить маме 🔁 weekly:sun
`,
    createdAt: at(1, 8),
    updatedAt: at(1, 1),
  })
  await repo.createNote({
    type: 'daily',
    dailyDate: today,
    content: `# ${new Date(now).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}

- [ ] Созвон с дизайном в 15:00
- [x] Ответить на письма
- [ ] Пробежка 5 км
- [ ] Прочитать 30 страниц

Заметка: перенести встречу с бухгалтером на понедельник.
`,
    createdAt: at(0, 6),
    updatedAt: at(0, 0.5),
  })
  return 'seeded'
}
