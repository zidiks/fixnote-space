---
title: 'FixNote keyboard shortcuts for Windows and Mac, in any layout'
description: 'Every FixNote keyboard shortcut for Windows and Mac: search, daily note, assistant, dictation and formatting, and why they keep working in any keyboard layout.'
date: 2026-09-24
translationKey: hotkeys
faq:
  - q: 'Why do FixNote shortcuts work with a Russian or Spanish keyboard layout?'
    a: 'FixNote checks both the character a key types and the physical key that was pressed. Ctrl+K works even when that key types a Cyrillic letter.'
  - q: "How do I open today's note from the keyboard?"
    a: "Press Ctrl+D on Windows or ⌘+D on Mac. If today's note doesn't exist yet, FixNote creates it."
  - q: "Why doesn't Ctrl+N create a note in the browser?"
    a: 'The browser keeps Ctrl+N for a new window. In the web app, press Ctrl+K and choose "New note"; in the desktop app Ctrl+N works.'
  - q: 'Can I change the keyboard shortcuts in FixNote?'
    a: 'No. The shortcuts are fixed and the same on every device. You can see them next to the commands in the right-click menu.'
---

Which keyboard shortcuts does FixNote have, and will they still work if you switch to another keyboard layout? Here is the full list for Windows and Mac: app-wide shortcuts, editor shortcuts and picking several notes at once, plus a short explanation of how the app recognizes a key.

## The main shortcuts

On Windows shortcuts start with Ctrl, on Mac with ⌘. The table shows the Windows version; on a Mac, read ⌘ for Ctrl.

| Shortcut | What it does |
|---|---|
| Ctrl+K | Opens search and commands: recent notes, search by words and by meaning, new note, today's note |
| Ctrl+D | Opens today's note |
| Ctrl+N | Creates a new note (desktop app) |
| Ctrl+J | Opens and closes the assistant |
| Ctrl+Shift+Space | Starts and stops dictation |
| Ctrl+\ | Hides and shows the sidebar |
| Ctrl+[ and Ctrl+] | Go back and forward |
| Esc | Cancels dictation, closes a dialog or ends picking notes |

Ctrl+N only works in the desktop app. In a browser it opens a new window, and a web page can't take it over, so in the web app you create a note with Ctrl+K and the "New note" command.

In the desktop app Ctrl+F opens search too. You can also go back and forward with Alt+← and Alt+→ (Option on a Mac) or with the side buttons of your mouse. Ctrl+K lists notes that match your words first, then notes that are similar in meaning; the [search page](/features/search/) explains how both work.

If you press Ctrl+Shift+Space while the assistant's input has focus, your words go into the question. Otherwise they go into the open note, or into a new one. Speech is recognized on your device; see [voice notes](/features/voice-notes/).

## Editor shortcuts

| Shortcut | What it does |
|---|---|
| Ctrl+B | Makes text bold |
| Ctrl+I | Makes text italic |
| Ctrl+Shift+S | Strikes text through |
| Ctrl+E | Formats text as code |
| Ctrl+Alt+1 and Ctrl+Alt+2 | Turn the line into a level 1 or level 2 heading |
| Ctrl+Shift+8 | Starts a bulleted list |
| Ctrl+Shift+9 | Starts a checklist |
| Ctrl+Shift+E | Opens "Ask AI…" for the selected text |

The right-click menu shows the same shortcuts next to each command, so there is nothing to memorize up front. Ctrl+Shift+E opens a box where you ask the AI to rewrite, shorten or fix the selection. The result appears as a change you accept or reject; [AI edits](/features/ai-edits/) shows what that looks like.

## Why shortcuts work in any keyboard layout

When you press a key, the browser reports two things: the character it produced and the physical key. On a Russian layout the K key types "л", but its code is still KeyK. Many apps only look at the character, so Ctrl+K on a Russian layout becomes an unknown Ctrl+Л and nothing happens.

FixNote checks both. Ctrl+K, Ctrl+J and even Ctrl+[ work without switching back to English, on Russian, Spanish and other layouts alike. Editor shortcuts such as Ctrl+B are recognized by the key as well.

## Picking several notes

In a list of notes, Ctrl+click (⌘+click on a Mac) starts picking, and plain clicks then check and uncheck notes. On a phone, a long press starts it. You can pin the picked notes, move them to a folder, send them to [Tidy up](/blog/tidy-up-notes-with-ai/) or delete them. Deleting can be undone from the notification; shared notes are left as they are and are deleted one at a time.

Esc or the "Done" button ends picking.

## The tray and menu bar icon

When you close the FixNote window on a computer, the app moves to the Windows tray (the menu bar on a Mac) and keeps running. From the icon's menu you can create a note, start a voice note, open today's note or search, and record a call without looking for the window. Launching FixNote again shows the window that is already open instead of starting a second copy.

To start, open FixNote, press Ctrl+D and write one task in today's note. Then press Ctrl+K, type a word from that task and check that the note comes up.
