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
 * are sealed before they get here. Sends made before the channel is joined wait for it.
 */
export function realtimeTransport(client: SupabaseClient, sharedId: string): CollabTransport {
  let handler: ((m: Uint8Array) => void) | null = null
  let joined = false
  const waiting: string[] = []
  const channel = client.channel(`shared:${sharedId}`, {
    config: { private: true, broadcast: { self: false } },
  })
  const post = (d: string) => void channel.send({ type: 'broadcast', event: 'm', payload: { d } })
  channel.on('broadcast', { event: 'm' }, ({ payload }) => {
    const d = (payload as { d?: unknown } | undefined)?.d
    if (typeof d === 'string') handler?.(fromB64(d))
  })
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return
    joined = true
    for (const d of waiting.splice(0)) post(d)
  })
  return {
    send(message) {
      const d = toB64(message)
      if (joined) post(d)
      else waiting.push(d)
    },
    onMessage(h) {
      handler = h
      return () => {
        handler = null
      }
    },
    close() {
      void client.removeChannel(channel)
    },
  }
}

/** `?dev-backend`: the room between tabs of this browser (they share the fake server too). */
export function broadcastChannelTransport(roomId: string): CollabTransport {
  const channel = new BroadcastChannel(`fixnote-collab:${roomId}`)
  let handler: ((m: Uint8Array) => void) | null = null
  channel.onmessage = (e: MessageEvent<Uint8Array>) => handler?.(e.data)
  return {
    send: (message) => channel.postMessage(message),
    onMessage(h) {
      handler = h
      return () => {
        handler = null
      }
    },
    close: () => channel.close(),
  }
}
