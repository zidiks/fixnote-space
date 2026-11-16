; The MCP server (fixnote-mcp.exe) is started by Claude and other MCP clients, not by FixNote, so
; the installer's check for a running FixNote misses it, and a running file cannot be replaced: the
; update used to fail halfway and leave MCP broken. Stop it first; the client starts it again.

!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM fixnote-mcp.exe'
  Pop $0
  Sleep 500
!macroend

; Explorer keeps icons in its cache by the exe's path, so after an update the shortcuts in Start, on
; the desktop and pinned to the taskbar kept the old icon. Tell the shell the icons changed
; (SHCNE_ASSOCCHANGED, flushed) and have Windows rebuild its icon cache.
!macro NSIS_HOOK_POSTINSTALL
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
  Pop $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM fixnote-mcp.exe'
  Pop $0
  Sleep 500
!macroend
