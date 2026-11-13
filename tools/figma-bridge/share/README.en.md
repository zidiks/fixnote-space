# Figma Bridge

Lets Claude (or any MCP client) read and change the file open in **Figma desktop**: layers,
pictures, variables, styles, components with variants and instances. No token, no paid plan, no
rate limits: it works on the free Starter plan too. Nothing leaves your computer: the plugin talks
only to `localhost:7331`.

## Install (once)

### 1. The MCP server

| You use | Do this |
|---|---|
| **Claude Desktop** (Windows, macOS) | Double-click **`Figma Bridge.mcpb`** → **Install**. No Node.js needed: Claude Desktop runs it. |
| **Claude Code, Cursor** | Needs [Node.js](https://nodejs.org) 18+ (LTS). Windows: double-click **`Install.cmd`**. macOS: right-click **`Install.command`** → **Open** (macOS asks once whether to trust it). |
| Another client | Run `Install` the same way: it prints the JSON for your MCP config. |

`Install` copies the bridge and the plugin to a **`Figma Bridge`** folder in your home folder, adds
the `figma-bridge` server to Claude Code (all projects) and Cursor, and opens the plugin folder.
You can delete the archive afterwards. Restart Claude Code / Cursor or start a new chat.

### 2. The Figma plugin

Development plugins install only in the **Figma desktop app**, not in the browser.

1. Open any file → **Plugins → Development → Import plugin from manifest…**
2. Pick `manifest.json`:
   - after `Install`: `Figma Bridge/plugin/manifest.json` in your home folder;
   - with the `.mcpb` only: unzip the archive somewhere permanent (e.g. Documents) and pick
     `plugin/manifest.json` there. Figma runs the plugin from that folder, so keep it.

## Each time

Open your file in Figma → **Plugins → Development → Figma Bridge (local)**. A thin bar appears in
the corner; a green dot means connected. Move it aside but keep it open: while it is closed,
Claude cannot see Figma. Then just ask, e.g. "What is selected in Figma? Build it in React +
Tailwind" or "Create colour variables in Figma from my tailwind config, Light and Dark".

Renders and layer JSON go to `Figma Bridge/files` in your home folder, and so do files from the
plugin's **Send selection** button.

## Update

New archive: run `Install` again and/or double-click the new `.mcpb`. The bridge updates the
plugin's code by itself on the next job.

## Troubleshooting

| Message | Fix |
|---|---|
| "The plugin is not running" | start the plugin in Figma, keep its window open |
| "The bridge is not running" | restart the MCP client; check that `figma-bridge` is enabled |
| "Port 7331 is busy" | another client already runs the bridge; that is fine, calls go through it |
| "No layer … in this file" | another file is open in Figma |
| macOS: "Install.command cannot be opened" | right-click → **Open**, or System Settings → Privacy & Security → **Open Anyway** |

## Uninstall

Claude Desktop: Settings → Extensions → Figma Bridge → Uninstall. Claude Code:
`claude mcp remove figma-bridge -s user`. Cursor: the `figma-bridge` entry in `~/.cursor/mcp.json`.
Figma: **Plugins → Development → Manage plugins in development**. Then delete `~/Figma Bridge`.

## Without MCP

`node figma-bridge.mjs help` lists the terminal commands: `serve`, `info`, `tree`, `render`,
`nodes`, `find`, `build spec.json`, `variables`, `styles` and more.
