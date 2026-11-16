/**
 * Fixnote's own social accounts. The footer links to them, and schema.ts lists them in `sameAs`,
 * so search engines tie the accounts to this site. Add a new account here, nowhere else.
 */
export interface SocialAccount {
  /** The network's name, shown as the link text (not translated). */
  name: string
  href: string
}

export const SOCIAL: readonly SocialAccount[] = [{ name: 'X', href: 'https://x.com/fixnotespace' }]
