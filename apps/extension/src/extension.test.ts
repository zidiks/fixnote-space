import sodium from 'libsodium-wrappers'
import { describe, expect, it } from 'vitest'
import { linkPayload, seal } from './api'
import { isAllowedSender, isExtensionMessage } from './messages'
import { DEFAULT_SITES, parseSites, ruleFor } from './sites'

describe('payload', () => {
  it('is a CapturePayload of kind link, without empty fields', () => {
    expect(
      JSON.parse(linkPayload({ url: 'https://a.example', title: 'A', text: ' ', source: 'x' }, 5)),
    ).toEqual({
      v: 1,
      kind: 'link',
      receivedAt: 5,
      url: 'https://a.example',
      title: 'A',
      source: 'x',
    })
  })

  it('is sealed so that only the key holder opens it', async () => {
    await sodium.ready
    const v = sodium.base64_variants.URLSAFE_NO_PADDING
    const keys = sodium.crypto_box_keypair()
    const sealed = await seal(sodium.to_base64(keys.publicKey, v), 'hello')
    expect(/^[A-Za-z0-9_-]+$/.test(sealed)).toBe(true)
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(sealed, v),
      keys.publicKey,
      keys.privateKey,
    )
    expect(sodium.to_string(opened)).toBe('hello')
  })
})

describe('social rules', () => {
  it('take a well-formed config from the site and refuse anything else', () => {
    expect(
      parseSites({ v: 1, sites: [{ id: 'x', name: 'X', hosts: ['x.com'], button: 'b' }] }),
    ).toEqual({ v: 1, sites: [{ id: 'x', name: 'X', hosts: ['x.com'], button: 'b' }] })
    expect(parseSites({ v: 2, sites: [] })).toBeNull()
    expect(parseSites({ v: 1, sites: [{ id: 'x' }] })).toBeNull()
    expect(parseSites('nope')).toBeNull()
  })

  it('find the rule by host', () => {
    expect(ruleFor(DEFAULT_SITES, 'www.reddit.com')?.id).toBe('reddit')
    expect(ruleFor(DEFAULT_SITES, 'X.com')?.id).toBe('x')
    expect(ruleFor(DEFAULT_SITES, 'example.com')).toBeNull()
  })

  it('ship the same rules the site serves', async () => {
    const { readFile } = await import('node:fs/promises')
    const served = JSON.parse(
      await readFile(new URL('../../landing/public/extension/sites.json', import.meta.url), 'utf8'),
    )
    expect(parseSites(served)).toEqual(DEFAULT_SITES)
  })
})

describe('security hardening', () => {
  const EXT_ID = 'abcdefghijklmnop'
  const EXT_ORIGIN = `chrome-extension://${EXT_ID}/`

  it('validates message sender identity and restricts privileged messages to extension pages', () => {
    expect(isExtensionMessage({ type: 'status' })).toBe(true)
    expect(isExtensionMessage({ type: 'unknown' })).toBe(false)

    // Foreign extension or page sender rejected
    expect(isAllowedSender({ type: 'status' }, { id: 'evil-ext' }, EXT_ID, EXT_ORIGIN)).toBe(false)
    expect(isAllowedSender({ type: 'unpair' }, {}, EXT_ID, EXT_ORIGIN)).toBe(false)

    // Content script on a web tab cannot invoke privileged messages (status/unpair)
    const webTab = { id: EXT_ID, tab: { url: 'https://x.com/home' }, url: 'https://x.com/home' }
    expect(isAllowedSender({ type: 'status' }, webTab, EXT_ID, EXT_ORIGIN)).toBe(false)
    expect(isAllowedSender({ type: 'unpair' }, webTab, EXT_ID, EXT_ORIGIN)).toBe(false)
    expect(isAllowedSender({ type: 'status' }, { id: EXT_ID, tab: {} }, EXT_ID, EXT_ORIGIN)).toBe(
      false,
    )

    // Content script on an HTTPS tab may send social-save
    const saveMsg = {
      type: 'social-save' as const,
      source: 'x',
      post: { url: 'https://x.com/1', title: '', text: '' },
    }
    expect(isAllowedSender(saveMsg, webTab, EXT_ID, EXT_ORIGIN)).toBe(true)
    expect(
      isAllowedSender(
        saveMsg,
        { id: EXT_ID, tab: { url: 'http://x.com' }, url: 'http://x.com' },
        EXT_ID,
        EXT_ORIGIN,
      ),
    ).toBe(false)

    // Extension pages (no tab, or chrome-extension://<id>/options.html) may invoke status/unpair
    expect(isAllowedSender({ type: 'status' }, { id: EXT_ID }, EXT_ID, EXT_ORIGIN)).toBe(true)
    expect(isAllowedSender({ type: 'unpair' }, { id: EXT_ID }, EXT_ID, EXT_ORIGIN)).toBe(true)
    expect(
      isAllowedSender(
        { type: 'status' },
        { id: EXT_ID, tab: { url: `${EXT_ORIGIN}options.html` }, url: `${EXT_ORIGIN}options.html` },
        EXT_ID,
        EXT_ORIGIN,
      ),
    ).toBe(true)
  })

  it('pins Supabase host_permissions to the exact project origin (no *.supabase.co wildcard)', async () => {
    const { readFile } = await import('node:fs/promises')
    const manifest = JSON.parse(
      await readFile(new URL('../static/manifest.json', import.meta.url), 'utf8'),
    ) as { host_permissions: string[] }
    expect(manifest.host_permissions).toContain('https://nsteehqbmljuczxgkvae.supabase.co/*')
    expect(manifest.host_permissions.some((p) => p.includes('*.supabase.co'))).toBe(false)
  })
})
