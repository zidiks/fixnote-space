import type { LinkPreview, PageFetcher } from '@fixnote/core'
import { useCallback } from 'react'
import { fetchPageViaServer, useAccount } from './account/account'
import { useDb } from './db'
import { platform } from './platform'

/**
 * Who reads pages for link cards: the desktop app itself, or on the web our `unfurl` function
 * for a signed-in user. Null means "no cards now"; nothing is recorded, so cards appear once
 * the user signs in.
 */
export function linkFetcher(): PageFetcher | null {
  if (platform.fetchPage) return platform.fetchPage
  if (useAccount.getState().phase !== 'ready') return null
  return async (url) => {
    const page = await fetchPageViaServer(url)
    if (!page) throw new Error('signed out')
    return page
  }
}

/** Loads (and caches) the preview of a link. */
export function useLoadPreview(): (url: string) => Promise<LinkPreview | null> {
  const { links } = useDb()
  return useCallback((url) => links.get(url, linkFetcher()), [links])
}
