#!/bin/sh
# Figma Bridge for macOS: double-click to start. Files go to the "files" folder next to this one.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org and run this again."
  read -r _
  exit 1
fi
node bridge.mjs serve --out "$(pwd)/files"
