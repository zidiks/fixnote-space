import sodium from 'libsodium-wrappers'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  cryptoReady,
  DecryptionError,
  decryptFolderName,
  decryptNote,
  deriveKeys,
  encryptFolderName,
  encryptNote,
  makeKeyCheck,
  newRecoverySecret,
  openSealedBox,
  phraseToSecret,
  publicKeyB64,
  secretToPhrase,
  verifyKeyCheck,
} from './index'

beforeAll(cryptoReady)

describe('recovery phrase', () => {
  it('round-trips 16 bytes through 12 words', () => {
    const secret = newRecoverySecret()
    const phrase = secretToPhrase(secret)
    expect(phrase.split(' ')).toHaveLength(12)
    expect(phraseToSecret(phrase)).toEqual(secret)
  })

  it('tolerates case, commas and line breaks', () => {
    const phrase = secretToPhrase(newRecoverySecret())
    const messy = `  ${phrase.toUpperCase().split(' ').join(',\n ')}  `
    expect(phraseToSecret(messy)).toEqual(phraseToSecret(phrase))
  })

  it('rejects wrong length, unknown words and bad checksums', () => {
    const words = secretToPhrase(newRecoverySecret()).split(' ')
    expect(phraseToSecret(words.slice(0, 11).join(' '))).toBeNull()
    expect(phraseToSecret([...words.slice(0, 11), 'notaword'].join(' '))).toBeNull()
    const swapped = [...words]
    ;[swapped[0], swapped[1]] = [swapped[1] as string, swapped[0] as string]
    // A swap almost always breaks the checksum; equal neighbours would make it a no-op.
    if (swapped[0] !== swapped[1]) expect(phraseToSecret(swapped.join(' '))).toBeNull()
  })
})

describe('keys', () => {
  it('are deterministic per secret and differ between accounts', () => {
    const secret = newRecoverySecret()
    expect(publicKeyB64(deriveKeys(secret))).toBe(publicKeyB64(deriveKeys(secret.slice())))
    expect(publicKeyB64(deriveKeys(newRecoverySecret()))).not.toBe(publicKeyB64(deriveKeys(secret)))
  })

  it('key check accepts only the right phrase', () => {
    const keys = deriveKeys(newRecoverySecret())
    const check = makeKeyCheck(keys)
    expect(verifyKeyCheck(keys, check)).toBe(true)
    expect(verifyKeyCheck(deriveKeys(newRecoverySecret()), check)).toBe(false)
    expect(verifyKeyCheck(keys, 'garbage')).toBe(false)
  })
})

describe('notes and folders', () => {
  const keys = () => deriveKeys(newRecoverySecret())

  it('round-trips unicode content with a fresh data key per push', () => {
    const k = keys()
    const text = '# Идея 💡\n\n- [ ] canción'
    const a = encryptNote(k, 'n1', text)
    const b = encryptNote(k, 'n1', text)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.wrappedKey).not.toBe(b.wrappedKey)
    expect(decryptNote(k, 'n1', a)).toBe(text)
    expect(a.ciphertext).not.toContain('Идея')
  })

  it('fails with another account key, another row id or tampered data', () => {
    const k = keys()
    const sealed = encryptNote(k, 'n1', 'secret')
    expect(() => decryptNote(keys(), 'n1', sealed)).toThrow(DecryptionError)
    expect(() => decryptNote(k, 'n2', sealed)).toThrow(DecryptionError)
    const flipped = `${sealed.ciphertext.slice(0, -2)}${sealed.ciphertext.endsWith('A') ? 'B' : 'A'}A`
    expect(() => decryptNote(k, 'n1', { ...sealed, ciphertext: flipped })).toThrow(DecryptionError)
  })

  it('encrypts folder names bound to the folder id', () => {
    const k = keys()
    const sealed = encryptFolderName(k, 'f1', 'Работа')
    expect(decryptFolderName(k, 'f1', sealed)).toBe('Работа')
    expect(() => decryptFolderName(k, 'f2', sealed)).toThrow(DecryptionError)
  })

  it('opens messages sealed to the public key (capture channels)', () => {
    const k = keys()
    const sealed = sodium.crypto_box_seal(sodium.from_string('from telegram'), k.box.publicKey)
    const b64 = sodium.to_base64(sealed, sodium.base64_variants.URLSAFE_NO_PADDING)
    expect(openSealedBox(k, b64)).toBe('from telegram')
    expect(() => openSealedBox(keys(), b64)).toThrow(DecryptionError)
  })
})
