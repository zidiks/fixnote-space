# Figma Bridge

Даёт Claude (и любому MCP-клиенту) читать и менять файл, открытый у вас в **Figma desktop**: слои,
картинки, переменные, стили, компоненты с вариантами и инстансы. Без токена, без платного тарифа и
без лимитов: работает и на бесплатном Starter. Всё остаётся на компьютере: плагин ходит только на
`localhost:7331`.

English: [README.en.md](README.en.md).

## Установка (один раз)

### 1. MCP-сервер

| У вас | Что сделать |
|---|---|
| **Claude Desktop** (Windows, macOS) | Двойной клик по **`Figma Bridge.mcpb`** → **Install**. Node.js не нужен: Claude Desktop запускает его сам. |
| **Claude Code, Cursor** | Нужен [Node.js](https://nodejs.org) 18+ (LTS). Windows: двойной клик по **`Install.cmd`**. macOS: правый клик по **`Install.command`** → **Открыть** (в первый раз macOS спросит, доверяете ли файлу). |
| Другой клиент | Запустите `Install` так же: он напечатает готовый JSON для конфига MCP. |

`Install` копирует мост и плагин в папку **`Figma Bridge`** в домашней папке (`C:\Users\<вы>\Figma
Bridge` или `~/Figma Bridge`), прописывает сервер `figma-bridge` в Claude Code (для всех проектов) и
Cursor и открывает папку с плагином. Архив после этого можно удалить.

После установки перезапустите Claude Code / Cursor или откройте новый чат.

### 2. Плагин в Figma

Плагины в режиме разработки ставятся только в **приложении Figma**, не в браузере.

1. Откройте любой файл → меню **Plugins → Development → Import plugin from manifest…**
2. Выберите `manifest.json`:
   - после `Install`: `Figma Bridge/plugin/manifest.json` в домашней папке;
   - только с `.mcpb`: распакуйте архив в постоянное место (например в Документы) и выберите
     `plugin/manifest.json` оттуда. Figma запускает плагин из этой папки, не удаляйте её.

## Каждый раз

Откройте нужный файл в Figma → **Plugins → Development → Figma Bridge (local)**. Появится узкая
полоска в углу: зелёная точка значит «подключено». Окно можно отодвинуть, но не закрывать: пока оно
закрыто, Claude не видит Figma.

Дальше просто пишите Claude, например:

- «Что у меня выделено в Figma? Сверстай этот фрейм на React + Tailwind»
- «Сделай скриншот выделенного экрана и сравни с моей страницей»
- «Заведи в Figma переменные цветов из моего `tailwind.config` с режимами Light и Dark»
- «Собери в Figma компонент Button с вариантами size и variant на этих переменных»

Картинки и JSON слоёв сохраняются в `Figma Bridge/files` в домашней папке, туда же падают
файлы с кнопки **Send selection** в окне плагина.

## Обновление

Пришёл новый архив: снова `Install` и/или двойной клик по новому `.mcpb`. Код плагина мост
обновляет сам при первом же задании. Импортировать плагин заново нужно, только если в Figma
появились странности с окном плагина.

## Если что-то не так

| Сообщение | Что делать |
|---|---|
| «The plugin is not running» | в Figma не запущен плагин или закрыто его окно |
| «The bridge is not running» | MCP-клиент не запустил сервер: перезапустите клиент, проверьте, что `figma-bridge` включён в списке MCP |
| «Port 7331 is busy» | мост уже запущен другим клиентом (например Claude Desktop и Cursor сразу) — это нормально, работают через него |
| «No layer … in this file» | в Figma открыт другой файл |
| Windows: `Install.cmd` пишет, что нет Node | поставьте Node.js LTS и запустите снова |
| macOS: «не удаётся открыть Install.command» | правый клик → **Открыть**, либо Системные настройки → Конфиденциальность → **Всё равно открыть** |

## Удалить

- Claude Desktop: Settings → Extensions → Figma Bridge → Uninstall.
- Claude Code: `claude mcp remove figma-bridge -s user`. Cursor: строка `figma-bridge` в `~/.cursor/mcp.json`.
- Figma: **Plugins → Development → Manage plugins in development** → удалить.
- Папку `Figma Bridge` в домашней папке.

## Без MCP, из терминала

`node figma-bridge.mjs help` — все команды: `serve` (запустить мост), `info`, `tree`, `render`,
`nodes`, `find`, `build spec.json`, `variables`, `styles` и другие.
