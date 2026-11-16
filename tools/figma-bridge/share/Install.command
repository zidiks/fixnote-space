#!/bin/sh
# Figma Bridge: copies the bridge and the plugin to ~/Figma Bridge and adds the MCP server to
# Claude Code and Cursor. Claude Desktop: double-click "Figma Bridge.mcpb" instead.
cd "$(dirname "$0")" || exit 1
# Node from Homebrew or the installer, also when the shell profile does not add it.
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is needed: https://nodejs.org (LTS), then run this again."
  echo "Only Claude Desktop? Double-click \"Figma Bridge.mcpb\" instead: it needs no Node."
  read -r _
  exit 1
fi
node figma-bridge.mjs install
echo
echo "Done. Press Enter to close."
read -r _
