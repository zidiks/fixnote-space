import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { requestSync } from './account/account'
import { notifyNotesChanged } from './assistant/assistant'
import { useDb } from './db'
import { usePlatform } from './platform'

const POLL_MS = 2000

/**
 * The desktop database can also be written by the local MCP server (another process).
 * `PRAGMA data_version` changes when another connection commits; then the screen, the search
 * index and sync catch up.
 */
export function useExternalChanges() {
  const platform = usePlatform()
  const { driver } = useDb()
  const qc = useQueryClient()
  useEffect(() => {
    if (platform.kind !== 'desktop') return
    let last: number | null = null
    let stopped = false
    const tick = async () => {
      try {
        const [row] = await driver.query<{ data_version: number }>('PRAGMA data_version')
        const version = Number(row?.data_version ?? 0)
        if (last !== null && version !== last) {
          void qc.invalidateQueries()
          notifyNotesChanged()
          requestSync()
        }
        last = version
      } catch {
        // The app is closing or the database is busy; try again on the next tick.
      }
    }
    const timer = setInterval(() => {
      if (!stopped) void tick()
    }, POLL_MS)
    void tick()
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [platform, driver, qc])
}
