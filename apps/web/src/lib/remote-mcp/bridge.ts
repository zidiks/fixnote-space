import {
  type BridgeStatus,
  localRemoteScope,
  MCP_REMOTE_KEY,
  type RemoteActivity,
  RemoteBridge,
  RemoteExecutor,
  type SqlDriver,
} from '@fixnote/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { create } from 'zustand'
import { captureBackend, useAccount } from '../account/account'
import { useLlm } from '../assistant/llm'
import { useDb } from '../db'
import { kvStore } from '../kv'
import { usePlan } from '../plan'
import { platform } from '../platform'

export const REMOTE_KEY = ['kv', MCP_REMOTE_KEY] as const
export const REMOTE_LOG = ['remote-mcp', 'log'] as const
export const REMOTE_OVERVIEW = ['remote-mcp', 'overview'] as const

/** The bridge's state for Settings; 'off' while it does not run. */
export const useRemoteMcp = create<{ status: BridgeStatus }>(() => ({ status: 'off' }))

/**
 * Calls running on this device now, and the last one for a moment after it ended (the quiet
 * indicator in the title bar fades out then).
 */
export const useRemoteActivity = create<{
  running: RemoteActivity[]
  shown: RemoteActivity | null
}>(() => ({ running: [], shown: null }))

/** How long the indicator stays after the last call. */
const LINGER_MS = 1500
let linger: ReturnType<typeof setTimeout> | undefined

function started(a: RemoteActivity) {
  clearTimeout(linger)
  useRemoteActivity.setState((s) => ({ running: [...s.running, a], shown: a }))
}

function ended(a: RemoteActivity) {
  useRemoteActivity.setState((s) => ({ running: s.running.filter((r) => r.id !== a.id) }))
  clearTimeout(linger)
  linger = setTimeout(() => {
    const { running } = useRemoteActivity.getState()
    useRemoteActivity.setState({ shown: running.at(-1) ?? null })
  }, LINGER_MS)
}

/** The remote MCP of the signed-in account, or null (signed out, locked, no relay). */
export const remoteMcpApi = () => captureBackend()?.remoteMcp ?? null

/** Whether Remote access is on for this device (kv `mcp.remote`). */
export function useRemoteEnabled(): boolean {
  const { driver } = useDb()
  return (
    useQuery({
      queryKey: REMOTE_KEY,
      queryFn: async () => (await kvStore(driver).get(MCP_REMOTE_KEY)) === '1',
    }).data ?? false
  )
}

let current: RemoteBridge | null = null
/** A scope change waits here until this device is connected. */
let scopeToSend = false

/**
 * The person changed which notes MCP apps may see here, or turned Remote access on: the relay
 * keeps it as the account's choice for remote apps (sent once this device is connected).
 */
export async function remoteScopeChanged(driver: SqlDriver) {
  if ((await kvStore(driver).get(MCP_REMOTE_KEY)) !== '1') return
  if (current?.status === 'online') current.setScope(await localRemoteScope(driver))
  else scopeToSend = true
}

const deviceLabel = () => {
  const ua = navigator.userAgent
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return [os, platform.kind === 'desktop' ? 'FixNote' : 'FixNote web'].filter(Boolean).join(' · ')
}

/**
 * Keeps this device reachable for remote MCP apps while it should be: signed in and unlocked,
 * Remote access on, not "Only on this device", and not known to be on Free (the relay checks the
 * plan itself). Calls run here through core `RemoteExecutor`; only answers leave the device.
 */
export function useRemoteBridge() {
  const { driver, repo, audit, attachments } = useDb()
  const qc = useQueryClient()
  const ready = useAccount((s) => s.phase === 'ready')
  const free = usePlan((s) => s.info?.plan === 'free')
  const localOnly = useLlm((s) => s.localOnly)
  const enabled = useRemoteEnabled()
  const api = ready ? remoteMcpApi() : null
  const run = Boolean(api && enabled && !free && !localOnly)

  useEffect(() => {
    if (!run || !api) return
    const executor = new RemoteExecutor(driver, repo, audit, {
      attachments,
      onStart: started,
      onCall: (_entry, activity) => {
        ended(activity)
        void qc.invalidateQueries({ queryKey: REMOTE_LOG })
        void qc.invalidateQueries({ queryKey: REMOTE_OVERVIEW })
      },
    })
    const bridge = new RemoteBridge({
      url: api.deviceUrl,
      token: () => api.token(),
      run: (call) => executor.run(call),
      state: () => ({
        device: deviceLabel(),
        kind: platform.kind === 'desktop' ? 'desktop' : 'web',
        syncedAt: useAccount.getState().sync.lastSyncedAt,
        serving: true,
      }),
      ...(api.connect ? { connect: api.connect } : {}),
      onStatus: (status) => {
        useRemoteMcp.setState({ status })
        if (status === 'online' && scopeToSend) {
          scopeToSend = false
          void localRemoteScope(driver).then((scope) => bridge.setScope(scope))
        }
        void qc.invalidateQueries({ queryKey: REMOTE_OVERVIEW })
      },
    })
    current = bridge
    bridge.start()
    // The relay prefers the device synced most recently.
    const unsub = useAccount.subscribe((s, prev) => {
      if (s.sync.lastSyncedAt !== prev.sync.lastSyncedAt) bridge.stateChanged()
    })
    const online = () => bridge.nudge()
    window.addEventListener('online', online)
    return () => {
      unsub()
      window.removeEventListener('online', online)
      if (current === bridge) current = null
      bridge.stop()
      useRemoteMcp.setState({ status: 'off' })
      useRemoteActivity.setState({ running: [], shown: null })
    }
  }, [run, api, driver, repo, audit, attachments, qc])
}

/** Mounted once in the app shell. */
export function RemoteMcpBridge() {
  useRemoteBridge()
  return null
}
