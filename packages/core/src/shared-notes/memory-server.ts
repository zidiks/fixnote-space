import {
  type FolderNote,
  INVITE_DAYS,
  type SaveResult,
  type SharedFolderMembership,
  type SharedMember,
  type SharedRemote,
  type SharedRole,
} from './index'

interface Member {
  role: SharedRole
  wrappedKey: string
  accepted: boolean
  invitedAt: number
}

interface NoteRow {
  owner: string
  origin: string
  state: string | null
  version: number
  members: Map<string, Member>
  folder: string | null
  folderKey: string | null
  createdBy: string
  deleted: boolean
}

interface FolderRow {
  owner: string
  origin: string
  name: string
  members: Map<string, Member>
  layout?: string | null
  layoutVersion?: number
}

const RANK: Record<SharedRole, number> = { owner: 0, edit: 1, view: 2 }
const stronger = (a: SharedRole | null, b: SharedRole | null) =>
  a && b ? (RANK[a] <= RANK[b] ? a : b) : (a ?? b)

/**
 * The shared-notes server in memory, with the rules of the real one
 * (supabase/migrations/*_shared_notes.sql, *_shared_invites.sql, *_shared_folders.sql): members
 * read, owner manages, editors save once they accepted; a folder's members get its notes. Tests
 * use it, and `?dev-backend` keeps one in localStorage (toJSON / fromJSON).
 */
export class MemorySharedServer {
  readonly users = new Map<string, { email: string; publicKey: string }>()
  readonly notes = new Map<string, NoteRow>()
  readonly folders = new Map<string, FolderRow>()
  /** Files of shared notes (`<shared id>/<file id>`), sealed, as base64. */
  readonly files = new Map<string, string>()
  private seq = 0
  /** The server's clock, for invitations that expire. */
  now = () => Date.now()
  /**
   * Whether an account has Pro (supabase/migrations/*_plans.sql): sharing a note on its own, a
   * folder, and inviting someone new need it; the people invited join on any plan.
   */
  isPro: (userId: string) => boolean = () => true

  toJSON(): string {
    const members = (m: Map<string, Member>) => [...m.entries()]
    return JSON.stringify({
      seq: this.seq,
      users: [...this.users.entries()],
      notes: [...this.notes.entries()].map(([id, n]) => [
        id,
        { ...n, members: members(n.members) },
      ]),
      folders: [...this.folders.entries()].map(([id, f]) => [
        id,
        { ...f, members: members(f.members) },
      ]),
      files: [...this.files.entries()],
    })
  }

  static fromJSON(json: string | null): MemorySharedServer {
    const server = new MemorySharedServer()
    if (!json) return server
    type Stored<T> = Omit<T, 'members'> & { members: [string, Member][] }
    const data = JSON.parse(json) as {
      seq?: number
      users?: [string, { email: string; publicKey: string }][]
      notes?: [string, Stored<NoteRow>][]
      folders?: [string, Stored<FolderRow>][]
      files?: [string, string][]
    }
    server.seq = data.seq ?? 0
    for (const [id, u] of data.users ?? []) server.users.set(id, u)
    for (const [id, n] of data.notes ?? [])
      server.notes.set(id, { ...n, members: new Map(n.members) })
    for (const [id, f] of data.folders ?? [])
      server.folders.set(id, { ...f, members: new Map(f.members) })
    for (const [path, b64] of data.files ?? []) server.files.set(path, b64)
    return server
  }

  remoteFor(userId: string): SharedRemote {
    const folderRole = (id: string | null, acceptedOnly = true) => {
      const m = id ? this.folders.get(id)?.members.get(userId) : undefined
      return m && (m.accepted || !acceptedOnly) ? m.role : null
    }
    // Readable (an invitation too) and usable (accepted only), as shared_role / shared_active_role.
    const role = (id: string) => {
      const n = this.notes.get(id)
      return stronger(n?.members.get(userId)?.role ?? null, folderRole(n?.folder ?? null))
    }
    const active = (id: string) => {
      const n = this.notes.get(id)
      const m = n?.members.get(userId)
      return stronger(m?.accepted ? m.role : null, folderRole(n?.folder ?? null))
    }
    const fresh = (m: Member) => m.accepted || m.invitedAt > this.now() - INVITE_DAYS * 86_400_000
    const must = (ok: boolean, why: string) => {
      if (!ok) throw new Error(why)
    }
    const needPro = () => must(this.isPro(userId), 'pro_required')
    const invite = (members: Map<string, Member>, user: string, r: SharedRole, key: string) => {
      const was = members.get(user)
      if (!was) needPro()
      members.set(user, {
        role: r,
        wrappedKey: key,
        accepted: was?.accepted ?? false,
        invitedAt: was?.accepted ? was.invitedAt : this.now(),
      })
    }
    const list = (members: Map<string, Member>): SharedMember[] =>
      [...members.entries()].map(([u, m]) => ({
        userId: u,
        email: this.users.get(u)?.email ?? '',
        role: m.role,
        accepted: m.accepted,
        invitedAt: m.invitedAt,
      }))
    return {
      memberships: async () =>
        [...this.notes.entries()].flatMap(([sharedId, n]) => {
          const m = n.members.get(userId)
          return m && !n.deleted
            ? [
                {
                  sharedId,
                  role: m.role,
                  wrappedKey: m.wrappedKey,
                  originNoteId: n.origin,
                  ownerId: n.owner,
                  accepted: m.accepted,
                  invitedAt: m.invitedAt,
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
        needPro()
        const id = `shared-${++this.seq}`
        this.notes.set(id, {
          owner: userId,
          origin,
          state: null,
          version: 0,
          members: new Map([
            [userId, { role: 'owner', wrappedKey, accepted: true, invitedAt: this.now() }],
          ]),
          folder: null,
          folderKey: null,
          createdBy: userId,
          deleted: false,
        })
        return id
      },
      accept: async (id) => {
        const m = this.notes.get(id)?.members.get(userId)
        must(Boolean(m && fresh(m)), 'not invited')
        if (m) m.accepted = true
      },
      saveState: async (id, state, base): Promise<SaveResult> => {
        must(active(id) === 'owner' || active(id) === 'edit', 'read only')
        const n = this.notes.get(id) as NoteRow
        must(!n.deleted, 'deleted')
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
        if (n) invite(n.members, user, r, wrappedKey)
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
      members: async (id) => (role(id) ? list(this.notes.get(id)?.members ?? new Map()) : []),

      folderMemberships: async () =>
        [...this.folders.entries()].flatMap(([folderId, f]): SharedFolderMembership[] => {
          const m = f.members.get(userId)
          return m
            ? [
                {
                  folderId,
                  role: m.role,
                  wrappedKey: m.wrappedKey,
                  originFolderId: f.origin,
                  ownerId: f.owner,
                  accepted: m.accepted,
                  invitedAt: m.invitedAt,
                  name: f.name,
                  layout: f.layout ?? null,
                  layoutVersion: f.layoutVersion ?? 0,
                },
              ]
            : []
        }),
      folderNotes: async (ids) =>
        [...this.notes.entries()].flatMap(([sharedId, n]): FolderNote[] =>
          n.folder && ids.includes(n.folder) && folderRole(n.folder)
            ? [
                {
                  sharedId,
                  folderId: n.folder,
                  folderKey: n.folderKey ?? '',
                  originNoteId: n.origin,
                  createdBy: n.createdBy,
                  deleted: n.deleted,
                },
              ]
            : [],
        ),
      shareFolder: async (origin, wrappedKey, name) => {
        for (const [id, f] of this.folders) if (f.owner === userId && f.origin === origin) return id
        needPro()
        const id = `folder-${++this.seq}`
        this.folders.set(id, {
          owner: userId,
          origin,
          name,
          members: new Map([
            [userId, { role: 'owner', wrappedKey, accepted: true, invitedAt: this.now() }],
          ]),
        })
        return id
      },
      saveFolderLayout: async (id, layout, base): Promise<SaveResult> => {
        const r = folderRole(id)
        must(r === 'owner' || r === 'edit', 'read only')
        const f = this.folders.get(id) as FolderRow
        const version = f.layoutVersion ?? 0
        if (version !== base) return { ok: false, version, state: f.layout ?? null }
        f.layout = layout
        f.layoutVersion = version + 1
        return { ok: true, version: f.layoutVersion }
      },
      renameFolder: async (id, name) => {
        must(folderRole(id, false) === 'owner', 'not the owner')
        const f = this.folders.get(id)
        if (f) f.name = name
      },
      acceptFolder: async (id) => {
        const m = this.folders.get(id)?.members.get(userId)
        must(Boolean(m && fresh(m)), 'not invited')
        if (m) m.accepted = true
      },
      addFolderMember: async (id, user, r, wrappedKey) => {
        must(folderRole(id, false) === 'owner', 'not the owner')
        const f = this.folders.get(id)
        if (f) invite(f.members, user, r, wrappedKey)
      },
      setFolderRole: async (id, user, r) => {
        must(folderRole(id, false) === 'owner', 'not the owner')
        const m = this.folders.get(id)?.members.get(user)
        if (m && m.role !== 'owner') m.role = r
      },
      removeFolderMember: async (id, user) => {
        const mine = folderRole(id, false)
        must(mine !== null && (mine === 'owner' || user === userId), 'not the owner')
        const f = this.folders.get(id)
        if (f?.members.get(user)?.role !== 'owner') f?.members.delete(user)
      },
      unshareFolder: async (id) => {
        must(folderRole(id, false) === 'owner', 'not the owner')
        for (const [noteId, n] of this.notes)
          if (n.folder === id) {
            if (n.members.size) {
              n.folder = null
              n.folderKey = null
            } else this.notes.delete(noteId)
          }
        this.folders.delete(id)
      },
      folderMembers: async (id) =>
        folderRole(id, false) ? list(this.folders.get(id)?.members ?? new Map()) : [],
      shareInFolder: async (folderId, origin, folderKey) => {
        const r = folderRole(folderId)
        must(r === 'owner' || r === 'edit', 'read only')
        const owner = this.folders.get(folderId)?.owner as string
        for (const [id, n] of this.notes)
          if (n.owner === owner && n.origin === origin && n.folder === folderId && !n.deleted)
            return id
        const id = `shared-${++this.seq}`
        this.notes.set(id, {
          owner,
          origin,
          state: null,
          version: 0,
          members: new Map(),
          folder: folderId,
          folderKey,
          createdBy: userId,
          deleted: false,
        })
        return id
      },
      attachToFolder: async (id, folderId, folderKey) => {
        const n = this.notes.get(id)
        must(
          n?.members.get(userId)?.role === 'owner' && folderRole(folderId) === 'owner',
          'not the owner',
        )
        if (n) {
          n.folder = folderId
          n.folderKey = folderKey
        }
      },
      removeFromFolder: async (id) => {
        const n = this.notes.get(id)
        must(Boolean(n?.folder) && folderRole(n?.folder ?? null) === 'owner', 'not the owner')
        if (!n) return
        if (n.members.size) {
          n.folder = null
          n.folderKey = null
        } else this.notes.delete(id)
      },
      deleteFolderNote: async (id) => {
        const n = this.notes.get(id)
        const r = folderRole(n?.folder ?? null)
        must(Boolean(n?.folder) && (r === 'owner' || r === 'edit'), 'read only')
        if (n) {
          n.deleted = true
          n.state = null
        }
      },
      // As the storage policies of *_shared_files.sql: members read; the owner and editors add,
      // within the owner's plan (the files count against the owner's storage).
      putFile: async (id, fileId, sealed) => {
        const n = this.notes.get(id)
        const r = active(id)
        must(Boolean(n) && !n?.deleted && (r === 'owner' || r === 'edit'), 'read only')
        must(this.isPro(n?.owner ?? ''), 'pro_required')
        let bin = ''
        for (const b of sealed) bin += String.fromCharCode(b)
        this.files.set(`${id}/${fileId}`, btoa(bin))
      },
      getFile: async (id, fileId) => {
        if (!active(id)) return null
        const b64 = this.files.get(`${id}/${fileId}`)
        return b64 ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : null
      },
    }
  }
}
