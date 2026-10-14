import { describe, expect, it } from 'vitest'
import {
  connectLink,
  isRedirectUrl,
  parseConnectLink,
  parseConsentResult,
  redirectHost,
} from './connect'

const ID = '5f0c2a8e-3b1d-4c7a-9e2f-1a2b3c4d5e6f'

describe('connect links', () => {
  it('round-trips the authorization id', () => {
    expect(connectLink(ID)).toBe(`fixnote://connect?authorization_id=${ID}`)
    expect(parseConnectLink(connectLink(ID))).toBe(ID)
    expect(parseConnectLink(`FIXNOTE://connect/?authorization_id=${ID}#x`)).toBe(ID)
    expect(parseConnectLink(`fixnote://connect?x=1&authorization_id=${ID}`)).toBe(ID)
  })

  it('ignores other links and odd ids', () => {
    expect(parseConnectLink('fixnote://billing/success')).toBeNull()
    expect(parseConnectLink('fixnote://connect')).toBeNull()
    expect(parseConnectLink('fixnote://connect?authorization_id=')).toBeNull()
    expect(parseConnectLink('fixnote://connect?authorization_id=a%20b%3Cscript')).toBeNull()
    expect(parseConnectLink(`https://evil.example/connect?authorization_id=${ID}`)).toBeNull()
    expect(parseConnectLink(`fixnote://connectx?authorization_id=${ID}`)).toBeNull()
  })
})

describe('consent results', () => {
  it('accepts http(s) redirects only', () => {
    expect(isRedirectUrl('https://claude.ai/api/mcp/auth_callback?code=x')).toBe(true)
    expect(isRedirectUrl('http://127.0.0.1:3334/callback?code=x')).toBe(true)
    expect(isRedirectUrl('javascript:alert(1)')).toBe(false)
    expect(isRedirectUrl('data:text/html,x')).toBe(false)
    expect(isRedirectUrl(42)).toBe(false)
  })

  it('parses what the app leaves at the relay', () => {
    expect(parseConsentResult({ approved: true, redirect: 'https://a.b/c?code=1' })).toEqual({
      approved: true,
      redirect: 'https://a.b/c?code=1',
    })
    expect(parseConsentResult({ approved: false, redirect: null })).toEqual({
      approved: false,
      redirect: null,
    })
    expect(parseConsentResult({ approved: true, redirect: null })).toBeNull()
    expect(parseConsentResult({ approved: true, redirect: 'javascript:x' })).toBeNull()
    expect(parseConsentResult({ redirect: 'https://a.b' })).toBeNull()
    expect(parseConsentResult(null)).toBeNull()
  })

  it('shows the host of a redirect', () => {
    expect(redirectHost('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(
      'chatgpt.com',
    )
    expect(redirectHost('nonsense')).toBe('nonsense')
  })
})
