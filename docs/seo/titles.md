# Proposed titles for pages with copy in i18n

Date: 2026-10-11. These pages take `title` and `description` from `apps/landing/src/i18n/<lang>.ts`
(`meta.*`), so they were not changed with the content files. The title is used as `<title>` as is
(no brand suffix added), so the brand is part of each line. Main queries come from
`docs/seo/semantics-<lang>.csv`. Ru is the reference; en and es follow their own search phrasing.

Limits: title ≤ 65 characters for ru, ≤ 60 for en and es; description ≤ 155.

| Page | Lang | Main query | Proposed `title` | Proposed `description` |
|---|---|---|---|---|
| `/` (home) | ru | приложение для заметок с ии | Приложение для заметок с ИИ и шифрованием — Fixnote | Приложение для заметок с ИИ и сквозным шифрованием для Windows, macOS и браузера. Пишите или диктуйте, а ассистент ответит по заметкам со ссылками. |
| `/` (home) | en | ai note taking app | AI note-taking app with end-to-end encryption \| Fixnote | A private AI note-taking app for Windows, macOS and the web. Notes are end-to-end encrypted; type or dictate, and the assistant answers with sources. |
| `/` (home) | es | app de notas con ia | App de notas con IA y cifrado de extremo a extremo \| Fixnote | App de notas con IA para Windows, macOS y navegador, con cifrado de extremo a extremo. Escribe o dicta y el asistente responde citando tus notas. |
| `/features/` | ru | возможности fixnote (navigational) | Возможности Fixnote: ИИ, голосовые заметки, расшифровка созвонов | ИИ-ассистент по заметкам, голосовой ввод без интернета, расшифровка созвонов, текст с картинок, бот в Telegram, совместные заметки и шифрование. |
| `/features/` | en | fixnote features (navigational) | Fixnote features: AI assistant, voice notes, meeting notes | An AI assistant for your notes, offline voice to text, bot-free meeting notes, OCR, a Telegram bot, shared notes and end-to-end encryption. |
| `/features/` | es | funciones de fixnote (navigational) | Funciones de Fixnote: IA, notas de voz y reuniones | Asistente de IA para tus notas, notas de voz sin internet, resumen de reuniones sin bot, texto de imágenes, bot de Telegram, notas compartidas y cifrado. |
| `/blog/` | ru | (brand + topics) | Блог Fixnote: как вести заметки, ИИ и приватность | keep current |
| `/blog/` | en | (brand + topics) | Fixnote blog: note-taking, AI and privacy | keep current |
| `/blog/` | es | (brand + topics) | Blog de Fixnote: tomar notas, IA y privacidad | keep current |
| `/download/` | ru | скачать приложение для заметок на компьютер | Скачать Fixnote: приложение для заметок для Windows и Mac | Скачайте Fixnote для Windows и macOS (Apple Silicon и Intel) или откройте веб-версию в браузере. Бесплатно, аккаунт не нужен. |
| `/download/` | en | notes app for windows download | Download Fixnote: notes app for Windows and Mac | Fixnote for Windows and macOS (Apple Silicon and Intel), plus a web version that runs in your browser. Free, no account needed. |
| `/download/` | es | descargar app de notas para pc | Descargar Fixnote: app de notas para Windows y Mac | Fixnote para Windows y macOS (Apple Silicon e Intel) y una versión web que funciona en el navegador. Gratis y sin cuenta. |
| `/security/` | ru | (brand) безопасность заметок | Безопасность Fixnote: как защищены ваши заметки | keep current |
| `/security/` | en | (brand) notes security | Fixnote security: how your notes are protected | keep current |
| `/security/` | es | (brand) seguridad de notas | Seguridad de Fixnote: cómo se protegen tus notas | keep current |
| `/setup/` | ru | как установить fixnote | keep current (Как установить Fixnote на Windows и Mac) | keep current |
| `/setup/` | en | how to install fixnote | keep current (How to install Fixnote on Windows and Mac) | keep current |
| `/setup/` | es | cómo instalar fixnote | keep current (Cómo instalar Fixnote en Windows y Mac) | keep current |
| `/windows/` (2026-10-17) | ru | заметки для windows | Заметки для Windows: программа для заметок на ПК — Fixnote | Программа для заметок на ПК с Windows 10 и 11: итоги созвонов без бота, диктовка без интернета, горячие клавиши из любого окна и шифрование. Бесплатно. |
| `/windows/` (2026-10-17) | en | notes app for windows | Notes app for Windows 10 and 11, free and offline \| Fixnote | A note-taking app for Windows 10 and 11: bot-free call summaries, offline dictation, system-wide shortcuts, MCP for Claude and encryption. Free to use. |
| `/windows/` (2026-10-17) | es | app de notas para windows | App de notas para PC con Windows 10 y 11, gratis \| Fixnote | App de notas para Windows 10 y 11: resúmenes de llamadas sin bot, dictado sin internet, atajos desde cualquier ventana y cifrado. Gratis y sin cuenta. |

## Why these

- **Home** takes the broadest commercial query: "приложение для заметок с ИИ" / "AI note-taking app" /
  "app de notas con IA". No feature page uses it, so there is no overlap. "Лучшие приложения…" /
  "best AI notes app" stays with the comparison article (list intent, different page type).
- **Security** moves off "зашифрованные заметки / end-to-end encrypted notes": that main query now
  belongs to `/features/encryption/`. Security keeps the brand query and the trust angle.
- **Download** uses the "скачать / download … for Windows and Mac" phrasing; the large
  "заметки для Windows / notes app for Windows" cluster needs its own landing page (see `NEW:/windows/`
  in the CSVs), not the download page.
- **Features index** changes "конспект созвона" to "расшифровка созвонов", the phrase people
  actually search, and in en "call summaries" to "meeting notes".
- **Current home description (ru)** is 174 characters, so search results cut it off. All proposals
  are ≤ 155.
