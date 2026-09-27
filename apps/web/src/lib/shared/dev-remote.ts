import type { SaveResult, SharedRemote, SharedRole } from '@fixnote/core'

/**
 * `?dev-backend`: shared notes on a fake server in localStorage, with the rules of the real one
 * (members read, owner manages, editors save). Kept apart from the personal fake server, so two
 * accounts in two browsers can share one of these while keeping their own notes.
 */
const KEY = 'fixnote.dev-shared'

interface State {
  users: Record<string, { email: string; publicKey: string }>
  notes: Record<
    string,
    {
      owner: string
      origin: string
      state: string | null
      version: number
      members: Record<
        string,
        { role: SharedRole; wrappedKey: string; at: number; accepted?: boolean }
      >
    }
  >
}

const channel = new BroadcastChannel(KEY)
const load = (): State => JSON.parse(localStorage.getItem(KEY) ?? '{"users":{},"notes":{}}')
const save = (s: State) => {
  localStorage.setItem(KEY, JSON.stringify(s))
  channel.postMessage('changed')
}

/** Makes an account findable by email (what signing up and creating keys does on the server). */
export function devRegisterUser(userId: string, email: string, publicKey: string) {
  const s = load()
  s.users[userId] = { email, publicKey }
  save(s)
}

/** Calls back when shared notes change (in this or another tab or bridged browser). */
export function devSharedChanges(onChange: () => void): () => void {
  const listener = () => onChange()
  channel.addEventListener('message', listener)
  return () => channel.removeEventListener('message', listener)
}

export function devSharedRemote(userId: string): SharedRemote {
  const role = (s: State, id: string) => s.notes[id]?.members[userId]?.role ?? null
  // Members from before invitations (no flag) count as accepted.
  const accepted = (m: { accepted?: boolean }) => m.accepted !== false
  const active = (s: State, id: string) => {
    const m = s.notes[id]?.members[userId]
    return m && accepted(m) ? m.role : null
  }
  const must = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  return {
    memberships: async () => {
      const s = load()
      return Object.entries(s.notes).flatMap(([sharedId, n]) => {
        const m = n.members[userId]
        return m
          ? [
              {
                sharedId,
                role: m.role,
                wrappedKey: m.wrappedKey,
                originNoteId: n.origin,
                ownerId: n.owner,
                accepted: accepted(m),
              },
            ]
          : []
      })
    },
    state: async (id) => {
      const s = load()
      const n = s.notes[id]
      return n && role(s, id) ? { state: n.state, version: n.version } : null
    },
    share: async (origin, wrappedKey) => {
      const s = load()
      for (const [id, n] of Object.entries(s.notes))
        if (n.owner === userId && n.origin === origin) return id
      const id = crypto.randomUUID()
      s.notes[id] = {
        owner: userId,
        origin,
        state: null,
        version: 0,
        members: { [userId]: { role: 'owner', wrappedKey, at: Date.now() } },
      }
      save(s)
      return id
    },
    accept: async (id) => {
      const s = load()
      const m = s.notes[id]?.members[userId]
      must(Boolean(m), 'not invited')
      if (m) m.accepted = true
      save(s)
    },
    saveState: async (id, state, base): Promise<SaveResult> => {
      const s = load()
      must(active(s, id) === 'owner' || active(s, id) === 'edit', 'read only')
      const n = s.notes[id]
      if (!n) throw new Error('no such note')
      if (n.version !== base) return { ok: false, version: n.version, state: n.state }
      n.state = state
      n.version++
      save(s)
      return { ok: true, version: n.version }
    },
    findUser: async (email) => {
      const want = email.trim().toLowerCase()
      const hit = Object.entries(load().users).find(([, u]) => u.email.toLowerCase() === want)
      return hit ? { userId: hit[0], publicKey: hit[1].publicKey } : null
    },
    addMember: async (id, user, r, wrappedKey) => {
      const s = load()
      must(role(s, id) === 'owner', 'not the owner')
      const n = s.notes[id]
      if (n)
        n.members[user] = {
          role: r,
          wrappedKey,
          at: n.members[user]?.at ?? Date.now(),
          accepted: n.members[user] ? accepted(n.members[user]) : false,
        }
      save(s)
    },
    setRole: async (id, user, r) => {
      const s = load()
      must(role(s, id) === 'owner', 'not the owner')
      const m = s.notes[id]?.members[user]
      if (m && m.role !== 'owner') m.role = r
      save(s)
    },
    removeMember: async (id, user) => {
      const s = load()
      must(role(s, id) === 'owner' || (role(s, id) !== null && user === userId), 'not the owner')
      const n = s.notes[id]
      if (n && n.members[user]?.role !== 'owner') delete n.members[user]
      save(s)
    },
    unshare: async (id) => {
      const s = load()
      must(role(s, id) === 'owner', 'not the owner')
      delete s.notes[id]
      save(s)
    },
    members: async (id) => {
      const s = load()
      if (!role(s, id)) return []
      return Object.entries(s.notes[id]?.members ?? {})
        .sort((a, b) => a[1].at - b[1].at)
        .map(([u, m]) => ({
          userId: u,
          email: s.users[u]?.email ?? '',
          role: m.role,
          accepted: accepted(m),
        }))
    },
  }
}
