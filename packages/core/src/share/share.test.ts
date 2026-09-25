import { beforeAll, describe, expect, it } from 'vitest'
import {
  cryptoReady,
  DecryptionError,
  deriveKeys,
  newRecoverySecret,
  newShareId,
  shareLinkKey,
} from '../crypto'
import {
  buildSharedNote,
  decodeShare,
  encodeShare,
  parseShareLocation,
  SHARE_FILES_BUDGET,
  sharedFileBytes,
  shareUrl,
} from './index'

beforeAll(cryptoReady)

describe('shared links', () => {
  it('seals a copy that only the link key opens, and any device derives the same key', async () => {
    const secret = newRecoverySecret()
    const keys = deriveKeys(secret)
    const id = newShareId()
    const key = shareLinkKey(keys, id)
    expect(shareLinkKey(deriveKeys(secret), id)).toBe(key)
    expect(shareLinkKey(keys, newShareId())).not.toBe(key)

    const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const note = await buildSharedNote(
      { title: 'Trip', content: '# Trip\n![](attachment:a1)\n![](attachment:gone)' },
      async (att) => (att === 'a1' ? png : null),
      42,
    )
    expect(note).toMatchObject({ title: 'Trip', sharedAt: 42, omitted: 1 })
    expect(note.files.a1?.mime).toBe('image/png')

    const payload = encodeShare(key, id, note)
    expect(payload).not.toContain('Trip')
    const opened = decodeShare(key, id, payload)
    expect(opened).toEqual(note)
    expect(sharedFileBytes(opened.files.a1 as { data: string })).toEqual(new Uint8Array([1, 2, 3]))

    expect(() => decodeShare(shareLinkKey(keys, newShareId()), id, payload)).toThrow(
      DecryptionError,
    )
    expect(() => decodeShare(key, newShareId(), payload)).toThrow(DecryptionError)
    expect(() => decodeShare('garbage', id, payload)).toThrow(DecryptionError)
  })

  it('leaves out files beyond the budget', async () => {
    const big = new Blob([new Uint8Array(SHARE_FILES_BUDGET - 10)])
    const note = await buildSharedNote(
      { title: '', content: '![](attachment:a)![](attachment:b)' },
      async () => big,
    )
    expect(Object.keys(note.files)).toEqual(['a'])
    expect(note.omitted).toBe(1)
  })

  it('builds and parses links', () => {
    const id = 'AAAAAAAAAAAAAAAAAAAAAA'
    expect(shareUrl('https://fixnote.space/', id, 'KEY')).toBe(`https://fixnote.space/?s=${id}#KEY`)
    expect(parseShareLocation(`?s=${id}`, '#KEY')).toEqual({ id, key: 'KEY' })
    expect(parseShareLocation('?s=short', '#KEY')).toBeNull()
    expect(parseShareLocation('', '')).toBeNull()
  })
})
