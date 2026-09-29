import { describe, expect, it } from 'vitest'
import { audioType, typedAudio } from './audio-type'

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  )

describe('audioType', () => {
  it('knows the formats browsers record and play', () => {
    expect(audioType(bytes([0x1a, 0x45, 0xdf, 0xa3], [0, 0]))).toBe('audio/webm')
    expect(audioType(bytes([0, 0, 0, 0x1c], 'ftypiso6'))).toBe('audio/mp4')
    expect(audioType(bytes('OggS', [0, 2]))).toBe('audio/ogg')
    expect(audioType(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))).toBe('audio/wav')
    expect(audioType(bytes('ID3', [4]))).toBe('audio/mpeg')
    expect(audioType(bytes('hello'))).toBe('')
  })

  it('sets the type only where it is missing', async () => {
    const mp4 = new Blob([bytes([0, 0, 0, 0x1c], 'ftypM4A ')])
    expect((await typedAudio(mp4)).type).toBe('audio/mp4')
    const typed = new Blob(['x'], { type: 'audio/webm' })
    expect(await typedAudio(typed)).toBe(typed)
  })
})
