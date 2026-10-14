import {
  type BridgeStatus,
  MCP_REMOTE_KEY,
  RemoteBridge,
  type RemoteCallEntry,
  RemoteExecutor,
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
export const REMOTE_CLIENTS = ['remote-mcp', 'clients'] as const

/** The bridge's state for Settings; 'off' while it does not run. */
export const useRemoteMcp = create<{ status: BridgeStatus }>(() => ({ status: 'off' }))

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
      onCall: (_entry: RemoteCallEntry) => {
        void qc.invalidateQueries({ queryKey: REMOTE_LOG })
        void qc.invalidateQueries({ queryKey: REMOTE_CLIENTS })
      },
    })
    const bridge = new RemoteBridge({
      url: api.deviceUrl,
      token: () => api.token(),
      run: (call) => executor.run(call),
      device: deviceLabel(),
      ...(api.connect ? { connect: api.connect } : {}),
      onStatus: (status) => useRemoteMcp.setState({ status }),
    })
    bridge.start()
    const online = () => bridge.nudge()
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('online', online)
      bridge.stop()
      useRemoteMcp.setState({ status: 'off' })
    }
  }, [run, api, driver, repo, audit, attachments, qc])
}

/** Mounted once in the app shell. */
export function RemoteMcpBridge() {
  useRemoteBridge()
  return null
}
