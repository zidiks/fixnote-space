import { cryptoReady, DecryptionError, decodeShare, type SharedNote } from '@fixnote/core'
import { pickBackend } from './account/pick'

/**
 * For the public page (no local database, no account): the note behind a link, 'gone' when the
 * link was revoked or never existed, 'broken' when the key in the link does not open it.
 */
export async function openSharedLink(
  id: string,
  key: string,
): Promise<SharedNote | 'gone' | 'broken'> {
  const [backend] = await Promise.all([pickBackend(), cryptoReady()])
  if (!backend) return 'gone'
  const row = await backend.getShare(id)
  if (!row) return 'gone'
  try {
    return decodeShare(key, id, row.payload)
  } catch (err) {
    if (err instanceof DecryptionError || err instanceof SyntaxError) return 'broken'
    throw err
  }
}
