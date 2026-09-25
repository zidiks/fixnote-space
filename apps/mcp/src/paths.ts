import { homedir, platform } from 'node:os'
import { join } from 'node:path'

const APP_ID = 'space.fixnote.app'

/** Where the desktop app keeps its database (Tauri's app-data directory). */
export function defaultDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.FIXNOTE_DB) return env.FIXNOTE_DB
  const home = homedir()
  switch (platform()) {
    case 'win32':
      return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), APP_ID, 'fixnote.db')
    case 'darwin':
      return join(home, 'Library', 'Application Support', APP_ID, 'fixnote.db')
    default:
      return join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), APP_ID, 'fixnote.db')
  }
}
