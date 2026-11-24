import type { ProtectedFragmentIdentity } from '../crypto'

const PREFIX = '⟦fixnote-private:v1:'
const REFERENCE =
  /⟦fixnote-private:v1:(personal|members):([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})⟧/g

/** Placeholder substituted for protected fragments in search, AI, MCP, comments, and exports. */
export const REDACTED_PROTECTED_FRAGMENT = '[protected fragment]'

export type ProtectedReference = Pick<ProtectedFragmentIdentity, 'fragmentId' | 'audience'>

/** The text survives clients without the protected fragment renderer. It carries no value or key. */
export function protectedReference({ audience, fragmentId }: ProtectedReference): string {
  return PREFIX + audience + ':' + fragmentId + '⟧'
}

/** Projection for previews, search, AI, MCP and conventional exports. */
export function redactProtectedReferences(content: string): string {
  return content.includes(PREFIX)
    ? content.replace(REFERENCE, REDACTED_PROTECTED_FRAGMENT)
    : content
}

export function protectedReferenceMatches(content: string): RegExpExecArray[] {
  return content.includes(PREFIX) ? [...content.matchAll(REFERENCE)] : []
}

export function parseProtectedReference(text: string): ProtectedReference | null {
  const match = protectedReferenceMatches(text)[0]
  if (!match || match[0] !== text) return null
  return {
    audience: match[1] === 'members' ? 'members' : 'personal',
    fragmentId: match[2] as string,
  }
}

export function containsProtectedReference(text: string): boolean {
  return protectedReferenceMatches(text).length > 0
}

/** Keep offsets exact when scanning a note that already contains protected references. */
export function maskProtectedReferences(text: string): string {
  return text.includes(PREFIX)
    ? text.replace(REFERENCE, (match) => '\n'.repeat(match.length))
    : text
}
