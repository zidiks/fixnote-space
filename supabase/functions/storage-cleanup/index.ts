import { createClient } from 'npm:@supabase/supabase-js@2'
import { type CleanupStore, handle } from './handler.ts'

// Service role: it removes other accounts' files.
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)
const bucket = () => db.storage.from('attachments')
const PAGE = 1000

const store: CleanupStore = {
  async claim() {
    const { data, error } = await db.rpc('claim_cleanup')
    if (error) throw error
    return data === true
  },
  async due() {
    const { data, error } = await db.rpc('files_due')
    if (error) throw error
    return (data as string[] | null) ?? []
  },
  async list(userId) {
    const paths: string[] = []
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket().list(userId, { limit: PAGE, offset })
      if (error) throw error
      paths.push(...data.map((f) => `${userId}/${f.name}`))
      if (data.length < PAGE) return paths
    }
  },
  async remove(paths) {
    const { error } = await bucket().remove(paths)
    if (error) throw error
  },
}

Deno.serve((req) => handle(req, store))
