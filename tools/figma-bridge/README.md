# Figma Bridge

Связывает файл, открытый у вас в Figma desktop, с этим компьютером в обе стороны, **без токена,
без платного тарифа и без лимитов** (работает и на бесплатном Starter):

- **читать**: слои, JSON, картинки, исходные фото, чтобы верстать по макету;
- **писать**: переменные, стили, фреймы с auto layout, текст, компоненты, наборы вариантов и
  инстансы. В Figma получаются настоящие редактируемые компоненты, привязанные к переменным, а не
  картинки. Главное применение: `figma_push_kit` переносит UI-кит FixNote из кода в Figma.

Как это устроено: маленький плагин в Figma выполняет задания через Plugin API (у него нет лимитов,
в отличие от REST API и хостового Figma MCP), а мост `bridge.mjs` на вашем компьютере передаёт ему
задания. Плагин ходит только на `localhost:7331`, в интернет ничего не уходит.

```
MCP-клиент (Claude Code…) ─► bridge.mjs mcp ─┐
команда в терминале ─────────► bridge.mjs ───┴► localhost:7331 ◄──► плагин в Figma ──► ваш файл
                                                     └─► .figma/ (JSON слоёв, PNG/SVG, фото)
```

## Что нужно

- **Figma desktop**: плагины в режиме разработки ставятся только в приложении, не в браузере.
- **Node.js 18+**, для `push-kit` нужен **Node 23.6+** (он читает `en.ts` без сборки; на старом
  Node подписи берутся из запасного списка). Больше ничего: никаких `npm install`.

## Установка (один раз)

1. **Плагин.** В Figma desktop откройте любой файл → **Plugins → Development → Import plugin from
   manifest…** → выберите `plugin/manifest.json` из этой папки. Если плагин уже был импортирован,
   ничего делать не надо: Figma подхватит новый `code.js` при следующем запуске.
2. **MCP.** В этом репозитории сервер уже прописан в `.mcp.json` (`figma-bridge`), так что Claude
   Code увидит его сам (подтвердите сервер при первом запуске). Для другого клиента:

   ```json
   {
     "mcpServers": {
       "figma-bridge": {
         "command": "node",
         "args": ["<путь>/tools/figma-bridge/bridge.mjs", "mcp"]
       }
     }
   }
   ```

   MCP-сервер сам запускает мост, если тот ещё не запущен, так что отдельный терминал не нужен. Без
   MCP мост запускается двойным кликом: `start-bridge.cmd` (Windows) или `start-bridge.command`
   (macOS).

## Поделиться с другими (Windows и macOS)

```bash
pnpm figma:pack        # = node tools/figma-bridge/pack.mjs
```

В `tools/figma-bridge/dist/` появятся:

- **`figma-bridge-<версия>.zip`** — его и отправляйте. Внутри папка `Figma Bridge`:
  - `Figma Bridge.mcpb` — расширение Claude Desktop: двойной клик → Install. Node не нужен, Claude
    Desktop запускает сервер своим Node;
  - `Install.cmd` (Windows) / `Install.command` (macOS) — копирует мост и плагин в `~/Figma Bridge`,
    прописывает сервер в Claude Code (user scope, через `claude mcp add`) и Cursor
    (`~/.cursor/mcp.json`) с полным путём к `node`, печатает JSON для других клиентов и открывает
    папку плагина. Нужен Node 18+;
  - `plugin/` — для **Import plugin from manifest…** в Figma; `figma-bridge.mjs` — мост одним файлом;
  - `README.md` / `README.en.md` — инструкция для получателя (исходники в `share/`).
- **`Figma Bridge.mcpb`** — то же расширение отдельно.

В пакете нет `figma_push_kit` и команды `push-kit`: кит читает исходники этого репозитория, и мост
без них его просто не показывает. Версия — `VERSION` в `bridge.mjs`: поднимайте её при изменениях,
Claude Desktop показывает её в списке расширений. Файлы (рендеры, JSON) у получателя идут в
`~/Figma Bridge/files`. Плагин им обновлять не нужно: мост сам пересылает новый `code.js`; заново
импортировать надо только при изменении `ui.html` или `manifest.json`.

**Дизайн FixNote для чужого файла Figma (кит и экраны).**

```bash
node tools/figma-bridge/bridge.mjs export-page Screens tools/figma-bridge/.figma/fixnote-screens.json
pnpm figma:kit
```

Первая команда выгружает страницу Screens из открытого файла (плагин запущен): каждый фрейм
обратно в спеки — auto layout, переменные и стили по имени, компоненты кита по ключу, векторы как
SVG, картинки внутри. Вторая (`pack.mjs kit`) собирает `dist/fixnote-figma.zip`: один бандл
`fixnote-figma.json` (кит из кода через `export-kit`, потом экраны), README и промпт для ИИ
получателя (`share/kit/`) и этот мост в `bridge/`. Без выгруженных экранов в архив идёт только кит.
У получателя всё заливается командой `node bridge/figma-bridge.mjs apply fixnote-figma.json` (или
MCP `figma_apply`); повторная заливка обновляет те же слои по ключам, на тарифе с одним режимом Dark
ложится отдельной коллекцией. Любую другую страницу так же: `export-page <страница>` → `apply`.

Плагин распространяется как плагин в разработке (import из manifest): так он работает на любом
тарифе и ходит на `localhost` через `devAllowedDomains`. Для публикации в Figma Community нужен
`localhost:7331` в `allowedDomains` и модерация Figma.

## Каждый раз

Откройте нужный файл в Figma и запустите **Plugins → Development → Figma Bridge (local)**.

Окно плагина: узкая полоска 260×36 в углу, чтобы не мешать:

- точка: серая означает «ждём мост», зелёная «подключено», оранжевая пульсирует, пока идёт задание;
- текст: `Working: build button…` во время работы, потом последнее действие, например
  `✓ build button · 172 new, 0 updated · 14:02`, а при ошибке её текст красным;
- стрелка справа раскрывает детали: подсказку, кнопку **Send selection** и журнал последних
  действий. Плагин помнит, раскрыто окно или нет.

Окно можно отодвинуть, но не закрывать: пока оно закрыто, задания не выполняются.

**Обновления плагина без перезапуска.** Figma читает `plugin/code.js` только при запуске плагина,
поэтому мост перед каждым заданием сравнивает файл с тем, что уже отправил, и при изменении
пересылает его (задание `reload`). Правки в `code.js` начинают работать сразу. Перезапуск нужен
только для `ui.html` и `manifest.json`. Если в **Plugins → Development** два плагина с одинаковым
именем, оставьте тот, что из `tools/figma-bridge/plugin`.

## UI-кит FixNote в Figma

Из MCP-клиента вызовите `figma_push_kit` (или просто напишите Claude «залей кит в Figma через
figma-bridge»). Без MCP:

```bash
node tools/figma-bridge/bridge.mjs push-kit
```

На странице **FixNote UI** появится рамка `FixNote UI` с досками:

| Часть | Что делает | Откуда берётся |
|---|---|---|
| `tokens` | коллекция **FixNote Theme**, режимы Light и Dark: все цвета, альфа-варианты для колец фокуса, слои `shadow-float`. Коллекция **FixNote Size**: `radius/*`, `space/*`. Текстовые стили `text/*` (Inter), стили эффектов `shadow/xs` и `shadow/float`. Плюс доска с образцами | `packages/ui/src/styles.css`: `:root` = Light, `.dark` = Dark, OKLCH переводится в sRGB, `var(--x)` остаётся алиасом |
| `icons` | компоненты `icon/*` 16×16 и `icon/spinner` | lucide-react, установленный в `apps/web` (те же пути, обводка 1.75) |
| `button` | **Button**: набор из 60 вариантов `variant × size`, плюс `hover / focus / disabled / loading` на размере default. Свойства: `Label`, `Show icon`, `Glyph` (замена иконки) | `buttonVariants` в `button.tsx` |
| `controls` | **Input** (`default / filled / focus / disabled`), **Badge** (`default / outline / brand`), **Kbd** | `input.tsx`, `badge.tsx`, `kbd.tsx` |
| `dialog` | **Dialog** со свойствами `Title` и `Description` и кнопками-инстансами; пример на затемнённом фоне | `dialog.tsx`, строки из `@fixnote/i18n` |
| `notes` | **Note card** (`default / hover / selected`) и **Note snippet** (`default / hover / active`). Свойства: `Title`, `Excerpt`, `Date`, `Pinned`, `Tasks` | `NoteCard.tsx`: `NoteCard`, `NoteSnippet` |
| `sidebar` | **Sidebar / Nav item**, **Sidebar / Folder** (`Shared`, `Subfolders`), **Sidebar / Section**, **Sidebar / Search** и весь **Sidebar** из их инстансов | `Sidebar.tsx`, `SidebarFolders.tsx` |
| `screens` | **Note row**, **New note row**, **Title bar**, **Spotlight / Item**, **Spotlight**. Два окна 1280×820 из инстансов: папка в виде списка и то же окно с открытым поиском (Ctrl+K) | `NoteCard.tsx` (`NoteRow`), `NoteGrid.tsx`, `ListView.tsx`, `TitleBar.tsx`, `Spotlight.tsx`; текст — пример на русском |

- **Повторный запуск обновляет, а не дублирует.** Каждый слой помечен ключом в plugin data. Те же
  ключи дают те же узлы: id сохраняются, инстансы в ваших макетах продолжают ссылаться на компоненты.
  Переменные и стили находятся по имени. Слои, которые вы сами добавили внутрь компонентов кита,
  при следующем push пропадут: источник истины — код.
- **Тёмная тема.** Все доски залиты `$background`. Выделите доску (или любой фрейм с инстансами) →
  справа **Layer → Apply variable mode → FixNote Theme → Dark**.
- **Если тариф даёт один режим на коллекцию**, Dark записывается в отдельную коллекцию
  **FixNote Theme (Dark)** с теми же именами переменных, и `push-kit` об этом пишет. Компоненты
  привязаны к Light; чтобы переключить тему, придётся заменить коллекцию (Swap library/collection)
  или поднять тариф.
- Можно залить только часть кита: `push-kit button notes` или `figma_push_kit {parts: ["button"]}`.
  Части опираются на предыдущие (`tokens` → `icons` → компоненты), поэтому первый раз заливайте
  кит целиком.
- Pro-карточка в сайдбаре и контекстные меню в кит пока не входят. Вместо превью картинок в
  строках заметок стоит заглушка.

### Как с этим работать дизайнеру

- **Экраны собраны из инстансов.** Текст строки, дата, метки «общая», «задачи», «подпапка»,
  превью меняются в правой панели как свойства (`Title`, `Excerpt`, `Shared`, `Tasks`…), без
  detach. Вложенный Kbd в поиске открыт наружу (exposed instance): его `Keys` видно у инстанса
  поиска.
- **Всё на auto layout, цвета на переменных, текст на стилях.** Своих «сырых» цветов в экранах нет
  (кроме светофора macOS и затемнения под диалогом), поэтому смена токена в коде и повторный push
  перекрашивают и компоненты, и экраны.
- **Повторный push перезаписывает то, что залил.** Источник истины — код. Чтобы рисовать новое на
  основе экрана, сделайте его копию (Ctrl+D) или перенесите на другую страницу: копия не связана
  с ключами моста и push её не трогает. Свои варианты компонентов держите в отдельных компонентах.
- **Тёмная тема на Starter.** Коллекция с одним режимом переключиться не может, Dark лежит отдельной
  коллекцией **FixNote Theme (Dark)**. На Professional и выше push сам добавит режим Dark в основную
  коллекцию, и экраны переключатся через **Apply variable mode**.

**Когда меняется UI в коде.** Токены, иконки и подписи кит перечитывает сам при каждом push.
Размеры и раскладку компонентов он берёт из спеков в `kit.mjs`: они переписаны с классов Tailwind
(`h-9 px-4` → `h: 36, pad: [0, '$space/16']`). Поменяли классы компонента — поправьте его спек
рядом и запустите push снова.

## Экраны FixNote в Figma

Страница **Screens** — все экраны приложения во всех состояниях, снятые с работающего приложения:
по ряду на группу (первый запуск, главная, заметка, папки и ссылки, поиск, ассистент, диалоги,
диктовка и звонок, настройки, аккаунт и Pro, вид «Заметки», тёмная тема, телефон). Это не
картинки: фреймы с auto layout там, где ряды и колонки ровные; цвета привязаны к переменным кита
(тёмные экраны — к **FixNote Theme (Dark)**), текст — к его стилям, иконки lucide — инстансы `icon/*`.

Перезалить после изменений в UI:

1. `pnpm dev`, открыть `http://localhost:5173/?dev-backend` в окне 1280×820, плагин в Figma запущен.
2. Один раз наполнить приложение демо-данными, в консоли страницы:
   `await (await import('/@fs/<репо>/tools/figma-bridge/fixnote/seed.js')).seed()` и перезагрузить.
3. Снять: `const s = await import('/@fs/<репо>/tools/figma-bridge/fixnote/screens.js'); s.start()`,
   ход — `s.status()`. Только часть: `s.start({ only: ['note', 'settings'] })` (группы или ключи).
   Телефон — отдельно, с окном 390×844: `s.start({ only: ['phone'] })`.

Те же ключи обновляют те же фреймы. Состояния (`STATES` в `screens.js`) выставляются через сторы
приложения (маршрут, диалоги, тариф, запись голоса…) или кликом; новое состояние — новая запись
там. Группа «Аккаунт и Pro» идёт по порядку (вход на фейковом сервере, пробный период, Pro), её
снимайте целиком. Перед прогоном сценарий сам загружает в плагин свежий `plugin/code.js`. Пока идёт
прогон, не правьте файлы, которые он подгрузил: Vite перезагрузит страницу. Окно браузера должно
быть видно, иначе вкладка фоновая и всё идёт в разы медленнее.

### Снять любую страницу

Движок (`web/capture.js`) не знает про FixNote: мост отдаёт его любой странице на этом компьютере.

```js
const cap = await import('http://127.0.0.1:7331/web/capture.js')
await cap.push({ key: 'screen/pricing', name: 'Pricing', page: 'Screens', x: 0, y: 0 })
```

Цвета привязываются к переменным файла, если у страницы есть CSS-переменная `--<имя>` того же
цвета. Не переносится: `::before`/`::after` сложнее плашки, SVG-маски или текста, CSS-трансформации
(размеры берутся уже после них), видео (серый прямоугольник).

## MCP-инструменты

| Инструмент | Что делает |
|---|---|
| `figma_status` | запущен ли мост, подключён ли плагин |
| `figma_info` | файл, страница, выделение |
| `figma_tree`, `figma_find`, `figma_nodes` | чтение: дерево, поиск, полный JSON слоёв |
| `figma_render` | картинка слоёв: PNG/JPG приходит прямо в ответ, файл сохраняется в `.figma/` |
| `figma_variables` | создать или обновить коллекцию: режимы и переменные (`COLOR`, `FLOAT`, `STRING`, `BOOLEAN`, алиасы `{alias: "foreground"}`, scopes, CSS-синтаксис) |
| `figma_styles` | текстовые стили и стили эффектов по имени |
| `figma_page` | создать страницу, при желании переключиться на неё |
| `figma_build` | создать или обновить слои по JSON-спекам (формат ниже) |
| `figma_keys` | что мост уже залил в этот файл: ключ, id, тип, имя |
| `figma_show` | выделить слои и показать их |
| `figma_remove` | удалить залитые слои по ключу или любые по id |
| `figma_script` | запасной выход: выполнить JS на Plugin API (такие слои без ключей не обновляются) |
| `figma_push_kit` | весь кит FixNote или его части |

### Формат спеков `figma_build`

```json
{
  "page": "Playground",
  "nodes": [
    {
      "key": "promo-card",
      "type": "COMPONENT",
      "name": "Promo card",
      "props": { "Title": "Try Pro", "Show badge": true },
      "layout": "col", "gap": "$space/8", "pad": "$space/16", "w": 280,
      "radius": "$radius/xl", "fill": "$card", "stroke": "$border", "effects": "shadow/xs",
      "children": [
        { "type": "INSTANCE", "of": "badge", "variant": { "variant": "brand" },
          "props": { "Label": "New" }, "bind": { "visible": "Show badge" } },
        { "type": "TEXT", "text": "Try Pro", "textStyle": "text/base-medium",
          "fill": "$foreground", "w": "fill", "bind": { "characters": "Title" } },
        { "type": "INSTANCE", "of": "button",
          "variant": { "variant": "brand", "size": "sm", "state": "default" },
          "props": { "Label": "Upgrade" } }
      ]
    }
  ]
}
```

- `type`: `FRAME`, `COMPONENT`, `COMPONENT_SET` (поле `variants`: спеки компонентов с
  `variant: {size: "sm"}`), `INSTANCE` (`of`: ключ или id компонента/набора, `variant`, `props`),
  `TEXT`, `RECTANGLE`, `ELLIPSE`, `SVG` (`svg`: разметка).
- `key` обязателен у слоёв верхнего уровня. Дети сопоставляются по `key`, иначе по типу и имени.
- Размеры: `w`/`h` задаются числом, `"hug"` или `"fill"`; плюс `minW`, `maxW`, `minH`, `maxH`.
  Auto layout: `layout: "row" | "col"`, `gap`, `wrap`, `pad` (`n`, `[v, h]` или `[t, r, b, l]`),
  `justify`, `align`. Позиция: `absolute`, `center`, `constraints`.
- Цвета (`fill`, `stroke`, `color` у иконок): `"$переменная"`, `"#hex"`, `{var, opacity}`,
  `{color, opacity}` или массив. Числа (`gap`, `pad`, `radius`, `strokeWidth`) можно привязать к
  FLOAT-переменной строкой `"$space/8"`.
- Эффекты: имя стиля (`"shadow/float"`) или список `{type, x, y, blur, spread, color}`.
- Текст: `text`, `textStyle` или `size` + `weight` + `lineHeight`, `maxLines`, `underline`, `upper`.
- Вложенные инстансы: `expose: true` у инстанса внутри компонента показывает его свойства на
  панели компонента; у инстанса такого компонента `nested: {Kbd: {Keys: "⌘K"}}` их задаёт.
- Свойства компонентов: `props` (строка → TEXT, `true/false` → BOOLEAN, `{swap: "icon/plus"}` →
  INSTANCE_SWAP) у компонента или набора, `bind` у слоёв внутри (`characters`, `visible`,
  `mainComponent`).
- Порядок: сначала переменные и стили, потом компоненты, потом то, что использует их инстансы.

## Команды в терминале

| Команда | Что делает |
|---|---|
| `node bridge.mjs status` | запущен ли мост и подключён ли плагин |
| `node bridge.mjs info` | файл, страница и выделение, которые видит плагин |
| `node bridge.mjs tree 279:51 --depth 2` | дерево слоёв: id, тип, имя, размер, текст |
| `node bridge.mjs nodes 279:51` | полный JSON слоёв |
| `node bridge.mjs render 279:51 --scale 2` | картинка слоя (`--format png\|jpg\|svg\|pdf`) |
| `node bridge.mjs originals 279:51` | фото в исходном виде |
| `node bridge.mjs find "Hero"` | слои на текущей странице по имени или тексту |
| `node bridge.mjs push-kit [части] [--page "FixNote UI"]` | кит FixNote |
| `node bridge.mjs build spec.json [--page name]` | слои из файла (`{page, nodes}` или массив спеков) |
| `node bridge.mjs variables vars.json` / `styles styles.json` | переменные / стили из файла |
| `node bridge.mjs keys` / `remove <ключи…>` | что залито / удалить |
| `node bridge.mjs script make.js` | выполнить JS на Plugin API |

- Вместо id можно вставить ссылку на слой (правый клик → **Copy link to selection**) или `279-51`.
  Без id команда берёт выделение.
- Файлы сохраняются в `./.figma` текущей папки или в `--out <папка>`.

## Если что-то не так

| Сообщение | Что делать |
|---|---|
| «The bridge is not running» | не запущен мост: `start-bridge.cmd`, или пусть MCP-клиент запустит `bridge.mjs mcp` |
| «The plugin is not running» | в Figma не открыт плагин или закрыто его окно |
| «Port 7331 is busy» | мост уже запущен в другом окне; MCP-сервер в этом случае работает через него |
| «No variable $… / No text style …» | сначала залейте `tokens` (`push-kit tokens`) |
| «No component …» | сначала залейте часть, где этот компонент создаётся (например `icons`, потом `button`) |
| «Unknown job …» | в Figma запущена старая копия плагина: закройте его окно и запустите снова (дальше обновления придут сами) |
| «No layer … in this file» | в Figma открыт другой файл |
| `figma_script`: «Script not run» | эта версия Figma не даёт выполнять код из строки; используйте `figma_build` |

Порт `7331` прописан в `plugin/manifest.json` и в `bridge.mjs`: если меняете, то в обоих местах (и
переимпортируйте плагин).

## Безопасность

- Мост слушает только `127.0.0.1`, с других компьютеров к нему не подключиться.
- Плагину разрешён только `http://localhost:7331`, в интернет из Figma он ничего не отправляет.
- Плагин меняет файл только по заданиям, которые вы (или ваш MCP-клиент) отправили мосту. Каждое
  действие видно в его окне. Отменить можно обычным Ctrl+Z / ⌘Z в Figma.
