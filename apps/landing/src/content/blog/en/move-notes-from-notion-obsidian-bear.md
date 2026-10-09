---
title: "Move notes from Notion, Obsidian, Bear and Apple Notes to FixNote"
description: "Importing into FixNote step by step: what to export from Notion, Obsidian, Bear and Apple Notes, what comes across, and how to get your notes back as Markdown."
date: 2026-10-01
translationKey: import
faq:
  - q: "Can I import my Notion workspace into FixNote?"
    a: "Yes. Export your pages from Notion as Markdown & CSV and pick the .zip in Settings → Data → Import notes. Pages become notes, subpages become folders and images become attachments. Notion databases (the CSV files) are left out."
  - q: "Does FixNote keep Obsidian folders and images?"
    a: "Yes. The folders of your vault become FixNote folders, and images that notes reference, including ![[...]] embeds, become attachments."
  - q: "What happens if I run the same import twice?"
    a: "Notes whose text is already in FixNote are skipped as duplicates, so importing the same export again adds nothing."
  - q: "How do I export my notes from FixNote to Markdown?"
    a: "Open Settings → Data → Export notes. FixNote saves a .zip with every note as Markdown plus a JSON copy."
---

Switching note apps usually stalls on one question: how do I bring years of notes along without losing anything? This guide walks through each source in turn: what to export from the old app, what FixNote brings over, what it leaves out, and how to take your notes back out as Markdown.

## Where to find import in FixNote

Open Settings → Data → Import notes. There are two buttons: Choose files, for `.zip` archives, Bear backups and single `.md` or `.txt` files, and Choose folder, for a whole folder of notes. The Mac app has a third one, Apple Notes.

Files are read on your device and are never uploaded to our server. FixNote first shows what it found: how many notes, folders and images, and how many files it can't bring over. Nothing is created until you press Import. If you don't like the result, press Undo in the message that appears afterwards, and the new notes and folders are removed.

## Obsidian and any folder of Markdown files

Press Choose folder and select your vault. Every `.md` file becomes a note and subfolders become FixNote folders. If a folder with the same name already exists at that level, notes go into it.

Images that notes reference become attachments. FixNote understands both a regular Markdown image, `![](img/photo.png)`, and an Obsidian embed, `![[photo.png]]`.

From the front matter FixNote takes the title, the created and updated dates, and tags. FixNote has no separate tags, so front matter tags are added to the end of the note as a line like `#work #ideas`, and search finds them as words. Notes without dates in their front matter get the file's modified date.

Links between notes can't stay links, because the files no longer live at the same paths. A link like `[text](other-note.md)` keeps its text, and double-bracket links stay in the note as written.

## Bear

In Bear, make a backup: you get a `.bear2bk` file. In FixNote press Choose files and pick it. The created and modified dates of your notes come from the backup.

Bear allows multi-word tags like `#home renovation#`. FixNote turns them into `#home-renovation`, so search treats the tag as one word.

## Notion

In Notion, export as Markdown & CSV and download the `.zip`. In FixNote press Choose files and pick the archive as it is; there's no need to unzip it. If Notion split the export into several archives inside one, FixNote reads those too.

Pages become notes, subpages are sorted into folders and images become attachments. FixNote removes the long IDs Notion adds to file and folder names. Notion databases arrive as CSV files, and import leaves them out.

## Apple Notes

Apple Notes import is available only in the FixNote app for Mac. Press Apple Notes, and macOS will ask whether FixNote may use Notes. Allow it. If you said no at some point, FixNote shows an Open System Settings button: turn on Notes for FixNote under Privacy & Security → Automation.

Then tick the folders you want to bring over. Nothing changes in Apple Notes itself. Images inside notes and tables come across, and dates are kept. Locked notes are skipped, and PDFs, scans and drawings stay in Apple Notes. After the import FixNote tells you how many of each there were.

## What import leaves out

FixNote brings over text and images. PDFs, spreadsheets and other files that aren't notes are skipped, and you see how many before the import starts. An image that can't be stored, for example because it is too large, stays in the note as its original link.

A note whose text is already in FixNote is skipped as a duplicate. So it is safe to run the import again later, for example after you added a few more notes in the old app.

## Getting organized after the move

After a big import, open Tidy up: the AI suggests folders and titles for untitled notes and finds duplicates, and you accept or reject each suggestion (more on the [Tidy up page](/features/tidy-up/)). [Search](/features/search/) understands word endings and also finds notes by meaning, which helps with old notes whose wording you no longer remember.

## How to take your notes back out

Settings → Data → Export notes saves a `.zip`: every note as Markdown, sorted into folders, the images, and a JSON copy. Any Markdown editor opens it, Obsidian included. FixNote can import the same archive: the JSON copy brings back folders and daily notes, for example on a computer where you don't want to turn on sync. Formats and details are on the [import and export page](/features/import-export/).

Start with one folder from your old app: import it, check how the notes and images look, and only then move the rest.
