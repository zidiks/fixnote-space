import type { AppUpdater, AvailableUpdate } from '@fixnote/core'
import { i18n } from '@fixnote/i18n'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { useDb } from './db'
import { kvStore } from './kv'
import { usePlatform } from './platform'

/** kv key: '0' turns the automatic check off (on by default). */
export const AUTO_UPDATE = 'updates.auto'

const FIRST_CHECK = 15_000
const EVERY = 6 * 3600_000

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'available'; update: AvailableUpdate }
  | { kind: 'installing'; version: string; progress: number | null }
  | { kind: 'failed'; message: string }

export const useUpdates = create<{ phase: Phase }>(() => ({ phase: { kind: 'idle' } }))
const set = (phase: Phase) => useUpdates.setState({ phase })

const TOAST_ID = 'app-update'

/** Looks for a newer version; `quiet` keeps "you're up to date" and errors out of sight. */
export async function checkForUpdate(updater: AppUpdater, quiet: boolean) {
  const phase = useUpdates.getState().phase
  if (phase.kind === 'checking' || phase.kind === 'installing') return
  set({ kind: 'checking' })
  try {
    const update = await updater.check()
    if (!update) {
      set({ kind: 'latest' })
      return
    }
    set({ kind: 'available', update })
    toast(i18n.t('updates.available', { version: update.version }), {
      id: TOAST_ID,
      duration: Number.POSITIVE_INFINITY,
      description: i18n.t('updates.availableBody'),
      action: { label: i18n.t('updates.install'), onClick: () => void installUpdate(update) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('update check failed', err)
    set(quiet ? { kind: 'idle' } : { kind: 'failed', message })
  }
}

/** Downloads and installs; the app restarts into the new version when it is done. */
export async function installUpdate(update: AvailableUpdate) {
  if (useUpdates.getState().phase.kind === 'installing') return
  set({ kind: 'installing', version: update.version, progress: null })
  const progress = (p: number | null) =>
    toast.loading(
      p === null
        ? i18n.t('updates.downloading', { version: update.version })
        : i18n.t('updates.downloadingPct', {
            version: update.version,
            pct: Math.round(p * 100),
          }),
      { id: TOAST_ID, duration: Number.POSITIVE_INFINITY },
    )
  progress(null)
  try {
    await update.install((p) => {
      set({ kind: 'installing', version: update.version, progress: p })
      progress(p)
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    set({ kind: 'failed', message })
    toast.error(i18n.t('updates.failed', { message }), { id: TOAST_ID, duration: 10_000 })
  }
}

/** Desktop only: checks shortly after start and then every few hours, unless turned off. */
export function useAutoUpdateCheck() {
  const updater = usePlatform().updater
  const { driver } = useDb()
  const enabled =
    useQuery({
      queryKey: ['kv', AUTO_UPDATE],
      queryFn: async () => (await kvStore(driver).get(AUTO_UPDATE)) !== '0',
      enabled: Boolean(updater),
    }).data ?? false
  useEffect(() => {
    if (!updater || !enabled) return
    const run = () => void checkForUpdate(updater, true)
    const first = setTimeout(run, FIRST_CHECK)
    const every = setInterval(run, EVERY)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  }, [updater, enabled])
}
