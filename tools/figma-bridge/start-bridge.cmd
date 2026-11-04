@echo off
rem Figma Bridge for Windows: double-click to start. Files go to the "files" folder next to this one.
title Figma Bridge
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node bridge.mjs serve --out "%~dp0files"
pause
