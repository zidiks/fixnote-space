import { ChatError } from '@fixnote/ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../account/account', () => ({
  chatTransport: async () => ({ url: 'https://x/llm', headers: {} }),
  requestSync: () => undefined,
  setLocalOnlyCheck: () => undefined,
}))
vi.mock('../platform', () => ({ platform: { secrets: { get: async () => 'key' } } }))

const { llm, offlineText, useLlm } = await import('./llm')

const online = (on: boolean) => vi.stubGlobal('navigator', { onLine: on })
const provider = (kind: 'fixnote' | 'ollama', baseUrl = '') =>
  useLlm.setState({
    settings: { ...useLlm.getState().settings, kind, baseUrl, model: 'm' },
    localOnly: false,
  })

afterEach(() => vi.unstubAllGlobals())

describe('AI without the internet', () => {
  it('says the device is offline instead of trying Fixnote AI', async () => {
    online(false)
    provider('fixnote')
    expect(await llm()).toEqual({ ok: false, reason: 'offline' })
  })

  it('still reaches a model on this computer', async () => {
    online(false)
    provider('ollama', 'http://localhost:11434')
    expect((await llm()).ok).toBe(true)
  })

  it('does not treat a model elsewhere on the network as local', async () => {
    online(false)
    provider('ollama', 'http://192.168.1.20:11434')
    expect(await llm()).toEqual({ ok: false, reason: 'offline' })
  })

  it('names a lost connection, and only that', () => {
    online(true)
    provider('fixnote')
    expect(offlineText(new TypeError('Failed to fetch'))).not.toBeNull()
    expect(offlineText(new ChatError(500, 'boom'))).toBeNull()
    expect(offlineText(new Error('Model said no'))).toBeNull()
  })
})
