---
title: 'MCP server for your notes: connect FixNote to Claude, Cursor and Codex'
description: 'How to give Claude Desktop, Cursor and Codex access to your FixNote notes through the MCP server, pick an access level and show only the folders you choose.'
date: 2026-10-03
translationKey: mcp
faq:
  - q: 'Do I need FixNote Pro to use the MCP server?'
    a: 'No. The MCP server is part of the Free plan. It runs on your computer against your local notes, so it needs neither an account nor the internet.'
  - q: 'Does MCP work in the FixNote web app?'
    a: 'No. The MCP server comes with the desktop app for Windows and macOS: the connected app starts it on the same computer.'
  - q: 'Can Claude delete my notes through MCP?'
    a: 'Only if access is set to Full. Anything deleted that way can be restored from AI activity in Settings → AI.'
  - q: 'Will Claude or Cursor send my notes to their model?'
    a: 'Our server is not involved. Whatever a connected app reads through MCP goes to its own model under its own terms, so only open the folders you are happy to share with it.'
---

You want Claude Desktop, Cursor or Codex to know what you decided on a project, and maybe to add the outcome of a conversation to a note. The FixNote desktop app has an MCP server for exactly that. This post covers how to connect it, which permissions to grant and how to keep an app inside a single work folder.

## What MCP is and what the FixNote server can do

The Model Context Protocol (MCP) is a standard way for AI apps to plug in outside tools. Claude Desktop, Claude Code, Cursor, Codex and many other clients speak it. FixNote gives them its note tools, the same set the built-in assistant uses.

With read access, a connected app can search your notes, read them along with their images and files, list recent notes and folders, and open the daily note. With write access it can also create notes, append to them and edit them, move them between folders, create and rename folders, and attach files. Deleting notes and folders requires full access.

## Where the server runs

The MCP server ships with the Windows and macOS apps; the web app doesn't have it. The connected app starts the server when it needs it, and the server reads FixNote's local database on that computer. It needs no internet and no account, so it keeps working in Only on this device mode, which is covered in [FixNote without the internet](/blog/offline-notes-app/). MCP is included in the Free plan.

Open FixNote at least once on the computer so the database exists. After updating FixNote, restart the connected app too; the update dialog reminds you.

## How to connect it

Go to Settings → AI → Connected apps (MCP) and click Add to Claude Desktop, Add to Cursor or Add to Codex. FixNote writes its entry into that app's config file and tells you which file it changed. Then restart the app.

For any other MCP client, click Copy settings. You get a short JSON snippet with the command that starts the server; paste it wherever your client keeps its list of MCP servers.

On a Mac, move FixNote to Applications first and open it from there. If it runs from somewhere else, FixNote asks you to move it, because the path to the server has to stay the same.

## Access levels

| Access | What connected apps can do |
|---|---|
| Off | Nothing |
| Read only | Search and read notes, see the images and files in them. This is the default |
| Read and write | Create and edit notes and folders, but not delete them |
| Full | All of the above, plus delete |

Every change made through MCP shows up in AI activity in the same settings section. You can undo a change as long as the note hasn't been edited since, and deleted notes and folders can be restored from there.

## Which notes an app can see

By default a connected app sees all your notes. Under Visible notes, pick Selected folders and notes, then tick the folders you want (subfolders come along) and any single notes. Everything else looks to the app as if it didn't exist: search doesn't find it, and asking for it by ID gets a "not found". New notes can only be created inside the selected folders.

An image or file from a note is available only if the app can see that note.

## What to ask Claude or Cursor

With read access, try something like "Find what we decided about the landing page design in my notes and turn it into a task list" or "What questions for the contractor did I write down last week?". With write access you can ask "Add a summary of this discussion to today's daily note" or "Create a release plan note in the Project folder".

In Cursor and Claude Code this works well for notes about your code: architecture decisions, commands you keep forgetting, what's left to finish. The [MCP feature page](/features/mcp/) lists everything the server can do.

Start with Read only and one folder of work notes, then ask Claude a question that only your notes can answer. Turn on write access once you've seen how the app handles your text.
