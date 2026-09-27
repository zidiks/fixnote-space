import { MemorySharedServer, type SharedRemote } from '@fixnote/core'

/**
 * `?dev-backend`: shared notes and folders on a fake server in localStorage, with the rules of the
 * real one (the core's MemorySharedServer, saved after every call). Kept apart from the personal
 * fake server, so two accounts in two browsers can share one of these while keeping their own notes.
 */
const KEY = 'fixnote.dev-shared'

const channel = new BroadcastChannel(KEY)

function load(): MemorySharedServer {
  try {
    const server = MemorySharedServer.fromJSON(localStorage.getItem(KEY))
    return server
  } catch {
    // An older layout of the fake server: start over.
    return new MemorySharedServer()
  }
}

function save(server: MemorySharedServer) {
  localStorage.setItem(KEY, server.toJSON())
  channel.postMessage('changed')
}

/** Makes an account findable by email (what signing up and creating keys does on the server). */
export function devRegisterUser(userId: string, email: string, publicKey: string) {
  const server = load()
  server.users.set(userId, { email, publicKey })
  save(server)
}

/** Calls back when shared notes change (in this or another tab or bridged browser). */
export function devSharedChanges(onChange: () => void): () => void {
  const listener = () => onChange()
  channel.addEventListener('message', listener)
  return () => channel.removeEventListener('message', listener)
}

export function devSharedRemote(userId: string): SharedRemote {
  const remote: Record<string, unknown> = {}
  for (const name of Object.keys(new MemorySharedServer().remoteFor(userId))) {
    remote[name] = async (...args: unknown[]) => {
      const server = load()
      const call = server.remoteFor(userId)[name as keyof SharedRemote] as (
        ...a: unknown[]
      ) => Promise<unknown>
      const result = await call(...args)
      save(server)
      return result
    }
  }
  return remote as unknown as SharedRemote
}
