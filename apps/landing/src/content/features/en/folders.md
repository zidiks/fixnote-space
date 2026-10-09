---
title: Folders and subfolders
metaTitle: 'Note folders and subfolders: organize notes fast in FixNote'
description: Nested folders in FixNote. Move notes one at a time or in bulk, see everything from subfolders in the parent folder, and let AI suggest where notes belong.
eyebrow: Organize
intro: How do you sort your notes into folders without spending an evening on it? FixNote has folders nested as deep as you like, moves many notes at once and has AI that suggests where each note should go.
card:
  title: Folders
  text: Folders and subfolders, bulk moves and AI suggestions for where notes go.
problem: Elaborate folder systems tend to get abandoned within a couple of weeks, because every note has to be filed by hand. Half your notes fit no folder at all, and everything piles up at the top level.
stepsTitle: How it works
steps:
  - title: Create a folder
    text: Click the folder-plus icon next to Folders in the sidebar. To add a subfolder, choose New subfolder in a folder's menu.
  - title: Move notes
    text: Right-click a note in the list and choose Move to. To move several, start a selection with Ctrl+click, or a long press on a phone.
  - title: Let AI file the rest
    text: Tidy up suggests folders and titles for your notes. You accept or reject each suggestion, and nothing changes without your say.
privacy: Folders are stored on your device with your notes and work without an account. With Pro they sync, and folder names are encrypted on the device just like note text, so the server only holds ciphertext.
faq:
  - q: What happens to the notes when I delete a folder?
    a: The notes stay and move to No folder. Subfolders are deleted together with their parent, and their notes move to No folder too.
  - q: Does a folder show the notes in its subfolders?
    a: Yes. A folder lists its own notes plus the notes of every subfolder, however deep.
  - q: Can I move many notes at once?
    a: Yes. Ctrl+click (⌘+click on a Mac) starts a selection, and plain clicks then check more notes. Press Move to on the selection bar and pick a folder.
  - q: Are folders kept on import and export?
    a: Yes. Importing from Obsidian, Notion, Apple Notes or a plain folder of Markdown files keeps the folder structure, and export puts notes into a .zip archive in the same folders.
---

## How folders work

Create a folder with the folder-plus icon next to the Folders heading in the sidebar. Every folder has a menu, opened with the three dots on hover or a right-click: New subfolder, Rename, Share… and Delete. A double-click on the name renames it too. The number next to a folder shows how many notes it holds.

There are three ways to file a note. In an open note, Move to lists your folders, No folder and New folder…. In the note list, the same options are in the right-click menu of a card. For a batch, start a selection with Ctrl+click (a long press on a phone) and press Move to on the selection bar. A note created inside a folder lands in that folder right away.

You don't have to file everything by hand. Select some notes and press Tidy up: AI suggests folders and titles, and you accept or reject each one. The assistant can also create folders and move notes into them when you ask something like "move everything about the renovation into Home". Both need a model: FixNote AI, your own key or Ollama.

## When it helps

Most people do fine with 3–5 broad folders such as Work, Home and Travel, and let [search](/features/search/) handle the rest. Subfolders suit projects: a folder per client with meetings and documents inside, while the client's folder still shows everything at once.

Folders also control access. In the [MCP server](/features/mcp/) settings you can show Claude or Cursor only the folders you pick, and the rest stays invisible to them. A folder can be shared so you work in it with other people; [shared notes and folders](/features/shared-notes/) are part of Pro. On the home screen, the Folder filter narrows the list to one folder.

## When another tool fits better

If you need databases with properties, filters and views like a kanban board, Notion is the better fit; see the [comparison with Notion](/vs/notion/). FixNote keeps notes in folders and relies on search and the assistant, and it has no graph of links or backlinks. If you think in links between notes, look at Obsidian.
