import { describe, expect, it } from 'vitest'
import { type DeviceHardware, fitVerdict, guessFit } from './device-fit'

const hw = (over: Partial<DeviceHardware> = {}): DeviceHardware => ({
  gpu: true,
  appleSilicon: false,
  discreteGpu: false,
  memoryGb: 8,
  cores: 8,
  ...over,
})

describe('how well an on-device model fits', () => {
  it('runs the small model well on any GPU', () => {
    expect(guessFit('small', hw())).toBe('good')
  })

  it('is slow on the processor alone, especially the larger model', () => {
    expect(guessFit('small', hw({ gpu: false, cores: 4 }))).toBe('slow')
    expect(guessFit('small', hw({ gpu: false, cores: 12 }))).toBe('ok')
    expect(guessFit('standard', hw({ gpu: false, cores: 16 }))).toBe('slow')
  })

  it('wants a strong GPU for the larger model', () => {
    expect(guessFit('standard', hw({ appleSilicon: true }))).toBe('good')
    expect(guessFit('standard', hw({ discreteGpu: true }))).toBe('good')
    expect(guessFit('standard', hw({ memoryGb: 4 }))).toBe('slow')
  })

  it('trusts a measured speed over the guess', () => {
    expect(fitVerdict('standard', hw({ gpu: false }), 22)).toEqual({
      fit: 'good',
      measured: true,
      tokensPerSecond: 22,
    })
    expect(fitVerdict('small', hw(), 3).fit).toBe('slow')
    expect(fitVerdict('small', hw(), null)).toEqual({ fit: 'good', measured: false })
  })
})
