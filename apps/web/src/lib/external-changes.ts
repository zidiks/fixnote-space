import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { requestSync } from './account/account'
import { notifyNotesChanged } from './assistant/assistant'
import { useDb } from './db'
import { usePlatform } from './platform'
import { invalidateNoteData } from './queries'

const POLL_MS = 2000

/**
 * The desktop database can also be written by the local MCP server (another process).
 * `PRAGMA data_version` changes when another connection commits; then the screen, the search
 * index and sync catch up. Pauses automatically while hidden to tray and checks immediately on focus.
 */
export function useExternalChanges() {
  const platform = usePlatform()
  const { driver } = useDb()
  const qc = useQueryClient()
  useEffect(() => {
    if (platform.kind !== 'desktop') return
    let last: number | null = null
    let stopped = false
    let inFlight = false
    let timer: ReturnType<typeof setInterval> | undefined

    const tick = async () => {
      if (stopped || inFlight) return
      inFlight = true
      try {
        const [row] = await driver.query<{ data_version: number }>('PRAGMA data_version')
        const version = Number(row?.data_version ?? 0)
        if (last !== null && version !== last) {
          void invalidateNoteData(qc)
          notifyNotesChanged()
          requestSync()
        }
        last = version
      } catch {
        // The app is closing or the database is busy; try again on the next tick.
      } finally {
        inFlight = false
      }
    }

    const startPolling = () => {
      if (timer !== undefined || stopped) return
      timer = setInterval(() => {
        if (!stopped && !document.hidden) void tick()
      }, POLL_MS)
    }

    const stopPolling = () => {
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        void tick()
        startPolling()
      }
    }

    const onFocus = () => {
      if (!document.hidden) void tick()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    if (!document.hidden) {
      void tick()
      startPolling()
    }

    return () => {
      stopped = true
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [platform, driver, qc])
}
