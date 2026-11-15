import type { CollabTransport } from '@fixnote/core'
import type { SupabaseClient } from '@supabase/supabase-js'

const toB64 = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

/**
 * A shared note's live-editing room over a private Supabase Realtime channel "shared:<id>": only
 * its members may join, only owner and editors may send (policies on realtime.messages). Messages
 * are sealed before they get here. Realtime joins the channel again by itself after the network
 * comes back; while it is not joined, messages are dropped (supabase-js would post each one over
 * REST, which fails the same way) and the session asks for what it missed once it is (`onStatus`).
 */
export function realtimeTransport(client: SupabaseClient, sharedId: string): CollabTransport {
  let handler: ((m: Uint8Array) => void) | null = null
  const statusHandlers = new Set<(connected: boolean) => void>()
  let joined = false
  const channel = client.channel(`shared:${sharedId}`, {
    config: { private: true, broadcast: { self: false } },
  })
  channel.on('broadcast', { event: 'm' }, ({ payload }) => {
    const d = (payload as { d?: unknown } | undefined)?.d
    if (typeof d === 'string') handler?.(fromB64(d))
  })
  channel.subscribe((status) => {
    // SUBSCRIBED again after every rejoin; CHANNEL_ERROR, TIMED_OUT or CLOSED when it drops.
    joined = status === 'SUBSCRIBED'
    for (const h of statusHandlers) h(joined)
  })
  return {
    send(message) {
      if (!joined || channel.state !== 'joined') return
      void channel
        .send({ type: 'broadcast', event: 'm', payload: { d: toB64(message) } })
        .catch(() => undefined)
    },
    onMessage(h) {
      handler = h
      return () => {
        handler = null
      }
    },
    onStatus(h) {
      statusHandlers.add(h)
      return () => statusHandlers.delete(h)
    },
    close() {
      statusHandlers.clear()
      void client.removeChannel(channel)
    },
  }
}

/**
 * `?dev-backend`: the room between tabs of this browser (they share the fake server too). Like
 * Realtime it is out of reach while the browser is offline (DevTools → Network → Offline): what is
 * sent or arrives meanwhile is lost.
 */
export function broadcastChannelTransport(roomId: string): CollabTransport {
  const channel = new BroadcastChannel(`fixnote-collab:${roomId}`)
  let handler: ((m: Uint8Array) => void) | null = null
  const statusHandlers = new Set<(connected: boolean) => void>()
  let online = navigator.onLine
  const status = () => {
    online = navigator.onLine
    for (const h of statusHandlers) h(online)
  }
  window.addEventListener('online', status)
  window.addEventListener('offline', status)
  channel.onmessage = (e: MessageEvent<Uint8Array>) => {
    if (online) handler?.(e.data)
  }
  return {
    send: (message) => {
      if (online) channel.postMessage(message)
    },
    onMessage(h) {
      handler = h
      return () => {
        handler = null
      }
    },
    onStatus(h) {
      statusHandlers.add(h)
      queueMicrotask(() => h(online))
      return () => statusHandlers.delete(h)
    },
    close: () => {
      statusHandlers.clear()
      window.removeEventListener('online', status)
      window.removeEventListener('offline', status)
      channel.close()
    },
  }
}
