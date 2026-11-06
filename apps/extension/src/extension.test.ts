import sodium from 'libsodium-wrappers'
import { describe, expect, it } from 'vitest'
import { linkPayload, seal } from './api'
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
