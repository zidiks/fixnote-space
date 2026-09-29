; The MCP server (fixnote-mcp.exe) is started by Claude and other MCP clients, not by FixNote, so
; the installer's check for a running FixNote misses it, and a running file cannot be replaced: the
; update used to fail halfway and leave MCP broken. Stop it first; the client starts it again.

!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM fixnote-mcp.exe'
  Pop $0
  Sleep 500
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM fixnote-mcp.exe'
  Pop $0
  Sleep 500
!macroend
