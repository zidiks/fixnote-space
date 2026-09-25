import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ORT_VERSION } from './ort'

describe('ORT_VERSION', () => {
  it('matches the onnxruntime-web the app bundles', () => {
    const pkg = JSON.parse(
      readFileSync(
        new URL('../node_modules/onnxruntime-web/package.json', import.meta.url),
        'utf8',
      ),
    ) as { version: string }
    expect(ORT_VERSION).toBe(pkg.version)
  })
})
