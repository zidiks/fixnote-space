import { create } from 'zustand'

/**
 * The browser extension asks to connect (`*_extension_requests.sql`): its "Connect" opens
 * `app.fixnote.space/?extension=<id>` or `fixnote://extension?id=<id>`, and the app shows
 * `ExtensionConnectDialog`. Any page can open such a link, so the dialog always asks and shows
 * the code to compare with the one in the extension.
 */
export const useExtensionRequest = create<{ id: string | null; at: number }>(() => ({
  id: null,
  at: 0,
}))

export const askExtension = (id: string) => useExtensionRequest.setState({ id, at: Date.now() })
export const closeExtension = () => useExtensionRequest.setState({ id: null })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The request id in `fixnote://extension?id=…`, or null for any other link. */
export function parseExtensionLink(link: string): string | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.protocol !== 'fixnote:') return null
  // `fixnote://extension?id=` parses with host "extension" (or path "//extension").
  const target = url.host || url.pathname.replace(/^\/+/, '').split('/')[0]
  if (target !== 'extension') return null
  const id = url.searchParams.get('id') ?? ''
  return UUID.test(id) ? id : null
}

/** `?extension=<id>` on the web app's address: taken out of the address and asked once. */
export function takeExtensionParam(): string | null {
  const url = new URL(location.href)
  const id = url.searchParams.get('extension')
  if (id === null) return null
  url.searchParams.delete('extension')
  history.replaceState(history.state, '', url)
  return UUID.test(id) ? id : null
}
