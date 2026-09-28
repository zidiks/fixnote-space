/**
 * storage-cleanup: removes the server copy of the files of accounts that never paid, once they have
 * been on Free for `plan_config.free_files_days` (supabase/migrations/*_open_trial.sql decides who,
 * `files_due`). The files stay on the account's devices, and the app fetches the missing ones
 * before the date. Called every night by pg_cron; it needs no key because it only removes what is
 * due anyway, and runs at most once an hour whoever calls it.
 */

export interface CleanupStore {
  /** False when a run started less than an hour ago. */
  claim(): Promise<boolean>
  /** Accounts whose files are due, a batch at a time. */
  due(): Promise<string[]>
  /** Paths of the account's files (`<user id>/<attachment id>`). */
  list(userId: string): Promise<string[]>
  remove(paths: string[]): Promise<void>
}

/** How many paths go in one remove call. */
const BATCH = 100

export async function handle(req: Request, store: CleanupStore): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!(await store.claim())) return Response.json({ skipped: true })
  let accounts = 0
  let files = 0
  for (const user of await store.due()) {
    const paths = await store.list(user)
    for (let i = 0; i < paths.length; i += BATCH) await store.remove(paths.slice(i, i + BATCH))
    accounts++
    files += paths.length
  }
  if (accounts) console.log(`removed ${files} files of ${accounts} accounts`)
  return Response.json({ accounts, files })
}
