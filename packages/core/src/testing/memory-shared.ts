import type { SaveResult, SharedMember, SharedRemote, SharedRole } from '../shared-notes'

interface Row {
  owner: string
  origin: string
  state: string | null
  version: number
  members: Map<string, { role: SharedRole; wrappedKey: string; accepted: boolean }>
}

/**
 * The shared-notes server in memory, with the rules of the real one
 * (supabase/migrations/*_shared_notes.sql, *_shared_invites.sql): members read, owner manages,
 * editors save once they accepted.
 */
export class MemorySharedServer {
  readonly users = new Map<string, { email: string; publicKey: string }>()
  readonly notes = new Map<string, Row>()
  private seq = 0

  remoteFor(userId: string): SharedRemote {
    const role = (id: string) => this.notes.get(id)?.members.get(userId)?.role ?? null
    const active = (id: string) => {
      const m = this.notes.get(id)?.members.get(userId)
      return m?.accepted ? m.role : null
    }
    const must = (ok: boolean, why: string) => {
      if (!ok) throw new Error(why)
    }
    return {
      memberships: async () =>
        [...this.notes.entries()].flatMap(([sharedId, n]) => {
          const m = n.members.get(userId)
          return m
            ? [
                {
                  sharedId,
                  role: m.role,
                  wrappedKey: m.wrappedKey,
                  originNoteId: n.origin,
                  ownerId: n.owner,
                  accepted: m.accepted,
                },
              ]
            : []
        }),
      state: async (id) => {
        const n = this.notes.get(id)
        return n && role(id) ? { state: n.state, version: n.version } : null
      },
      share: async (origin, wrappedKey) => {
        for (const [id, n] of this.notes) if (n.owner === userId && n.origin === origin) return id
        const id = `shared-${++this.seq}`
        this.notes.set(id, {
          owner: userId,
          origin,
          state: null,
          version: 0,
          members: new Map([[userId, { role: 'owner', wrappedKey, accepted: true }]]),
        })
        return id
      },
      accept: async (id) => {
        const m = this.notes.get(id)?.members.get(userId)
        must(Boolean(m), 'not invited')
        if (m) m.accepted = true
      },
      saveState: async (id, state, base): Promise<SaveResult> => {
        must(active(id) === 'owner' || active(id) === 'edit', 'read only')
        const n = this.notes.get(id) as Row
        if (n.version !== base) return { ok: false, version: n.version, state: n.state }
        n.state = state
        n.version++
        return { ok: true, version: n.version }
      },
      findUser: async (email) => {
        for (const [id, u] of this.users)
          if (u.email.toLowerCase() === email.trim().toLowerCase())
            return { userId: id, publicKey: u.publicKey }
        return null
      },
      addMember: async (id, user, r, wrappedKey) => {
        must(role(id) === 'owner', 'not the owner')
        const n = this.notes.get(id)
        n?.members.set(user, {
          role: r,
          wrappedKey,
          accepted: n.members.get(user)?.accepted ?? false,
        })
      },
      setRole: async (id, user, r) => {
        must(role(id) === 'owner', 'not the owner')
        const m = this.notes.get(id)?.members.get(user)
        if (m && m.role !== 'owner') m.role = r
      },
      removeMember: async (id, user) => {
        must(role(id) !== null && (role(id) === 'owner' || user === userId), 'not the owner')
        const n = this.notes.get(id)
        if (n?.members.get(user)?.role !== 'owner') n?.members.delete(user)
      },
      unshare: async (id) => {
        must(role(id) === 'owner', 'not the owner')
        this.notes.delete(id)
      },
      members: async (id): Promise<SharedMember[]> =>
        role(id)
          ? [...(this.notes.get(id)?.members.entries() ?? [])].map(([u, m]) => ({
              userId: u,
              email: this.users.get(u)?.email ?? '',
              role: m.role,
              accepted: m.accepted,
            }))
          : [],
    }
  }
}
