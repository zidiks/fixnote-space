@echo off
rem Figma Bridge: copies the bridge and the plugin to %USERPROFILE%\Figma Bridge and adds the
rem MCP server to Claude Code and Cursor. Claude Desktop: double-click "Figma Bridge.mcpb" instead.
title Figma Bridge
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is needed: https://nodejs.org ^(LTS^), then run this again.
  echo Only Claude Desktop? Double-click "Figma Bridge.mcpb" instead: it needs no Node.
  pause
  exit /b 1
)
node figma-bridge.mjs install
echo.
pause
