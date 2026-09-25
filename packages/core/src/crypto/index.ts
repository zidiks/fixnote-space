/**
 * End-to-end encryption. The server only ever sees ciphertext, wrapped keys and a public key.
 *
 * Secret: 16 random bytes, shown to the user once as a 12-word BIP39 recovery phrase.
 * Master key = BLAKE2b(secret). Subkeys are derived with crypto_kdf so each purpose has its own key.
 * Every push encrypts the note with a fresh data key (XChaCha20-Poly1305); the data key is wrapped
 * with the wrap key. Ciphertexts are bound to their row id (associated data), so the server cannot
 * swap one note's content into another.
 */
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import sodium from 'libsodium-wrappers'

const VERSION = 'v1'
const KEY_CHECK_PLAINTEXT = 'fixnote-key-check-v1'

export interface AccountKeys {
  /** 16 bytes; the recovery phrase encodes exactly this. Keep it in the OS keychain only. */
  readonly secret: Uint8Array
  readonly wrapKey: Uint8Array
  readonly folderKey: Uint8Array
  readonly checkKey: Uint8Array
  readonly box: { publicKey: Uint8Array; privateKey: Uint8Array }
}

export class DecryptionError extends Error {
  constructor(what: string) {
    super(`Could not decrypt ${what}: wrong key or tampered data`)
    this.name = 'DecryptionError'
  }
}

/** libsodium loads a wasm module; await once before any other call. */
export async function cryptoReady(): Promise<void> {
  await sodium.ready
}

const b64 = (bytes: Uint8Array) =>
  sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING)
const unb64 = (text: string) => sodium.from_base64(text, sodium.base64_variants.URLSAFE_NO_PADDING)

function seal(key: Uint8Array, plaintext: Uint8Array, ad: string): string {
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, ad, null, nonce, key)
  return `${VERSION}.${b64(nonce)}.${b64(ct)}`
}

function open(key: Uint8Array, sealed: string, ad: string, what: string): Uint8Array {
  const [version, nonce, ct] = sealed.split('.')
  if (version !== VERSION || !nonce || !ct) throw new DecryptionError(what)
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, unb64(ct), ad, unb64(nonce), key)
  } catch {
    throw new DecryptionError(what)
  }
}

// ── Recovery phrase ──────────────────────────────────────────────────────────

export function newRecoverySecret(): Uint8Array {
  return sodium.randombytes_buf(16)
}

export function secretToPhrase(secret: Uint8Array): string {
  return entropyToMnemonic(secret, wordlist)
}

/** Accepts any spacing, commas, line breaks and case. Returns null for an invalid phrase. */
export function phraseToSecret(input: string): Uint8Array | null {
  const phrase = input
    .normalize('NFKD')
    .toLowerCase()
    .split(/[\s,;.]+/)
    .filter(Boolean)
    .join(' ')
  if (phrase.split(' ').length !== 12 || !validateMnemonic(phrase, wordlist)) return null
  return mnemonicToEntropy(phrase, wordlist)
}

/** The BIP39 English list, for autocomplete while typing a phrase. */
export const PHRASE_WORDS: readonly string[] = wordlist

// ── Keys ─────────────────────────────────────────────────────────────────────

export function deriveKeys(secret: Uint8Array): AccountKeys {
  if (secret.length !== 16) throw new Error('Recovery secret must be 16 bytes')
  const master = sodium.crypto_generichash(32, secret, sodium.from_string('fixnote/master/v1'))
  const sub = (id: number, ctx: string) => sodium.crypto_kdf_derive_from_key(32, id, ctx, master)
  const box = sodium.crypto_box_seed_keypair(sub(4, 'fn_box__'))
  return {
    secret,
    wrapKey: sub(1, 'fn_wrap_'),
    folderKey: sub(2, 'fn_fold_'),
    checkKey: sub(3, 'fn_check'),
    box: { publicKey: box.publicKey, privateKey: box.privateKey },
  }
}

export function publicKeyB64(keys: AccountKeys): string {
  return b64(keys.box.publicKey)
}

/** Stored on the server so another device can tell a right phrase from a wrong one. */
export function makeKeyCheck(keys: AccountKeys): string {
  return seal(keys.checkKey, sodium.from_string(KEY_CHECK_PLAINTEXT), 'key-check')
}

export function verifyKeyCheck(keys: AccountKeys, check: string): boolean {
  try {
    return (
      sodium.to_string(open(keys.checkKey, check, 'key-check', 'key check')) === KEY_CHECK_PLAINTEXT
    )
  } catch {
    return false
  }
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export interface SealedNote {
  wrappedKey: string
  ciphertext: string
}

export function encryptNote(keys: AccountKeys, noteId: string, plaintext: string): SealedNote {
  const dataKey = sodium.randombytes_buf(32)
  return {
    wrappedKey: seal(keys.wrapKey, dataKey, `dk:${noteId}`),
    ciphertext: seal(dataKey, sodium.from_string(plaintext), `note:${noteId}`),
  }
}

export function decryptNote(keys: AccountKeys, noteId: string, sealed: SealedNote): string {
  const dataKey = open(keys.wrapKey, sealed.wrappedKey, `dk:${noteId}`, `note ${noteId} key`)
  return sodium.to_string(open(dataKey, sealed.ciphertext, `note:${noteId}`, `note ${noteId}`))
}

export function encryptFolderName(keys: AccountKeys, folderId: string, name: string): string {
  return seal(keys.folderKey, sodium.from_string(name), `folder:${folderId}`)
}

export function decryptFolderName(keys: AccountKeys, folderId: string, sealed: string): string {
  return sodium.to_string(open(keys.folderKey, sealed, `folder:${folderId}`, `folder ${folderId}`))
}

// ── Attachments ──────────────────────────────────────────────────────────────

const ATTACHMENT_VERSION = 1

/**
 * An attachment as stored on the server: one opaque blob. A fresh data key per file, wrapped with
 * the account key; the type travels inside the ciphertext. Layout:
 * [version][2-byte wrapped-key length][wrapped key][nonce][ciphertext of (4-byte header length,
 * JSON header, bytes)], both parts bound to the attachment id.
 */
export function encryptAttachment(
  keys: AccountKeys,
  id: string,
  mime: string,
  bytes: Uint8Array,
): Uint8Array {
  const dataKey = sodium.randombytes_buf(32)
  const wrapped = sodium.from_string(seal(keys.wrapKey, dataKey, `ak:${id}`))
  const header = sodium.from_string(JSON.stringify({ mime }))
  const plain = new Uint8Array(4 + header.length + bytes.length)
  new DataView(plain.buffer).setUint32(0, header.length)
  plain.set(header, 4)
  plain.set(bytes, 4 + header.length)
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plain,
    `att:${id}`,
    null,
    nonce,
    dataKey,
  )
  const out = new Uint8Array(3 + wrapped.length + nonce.length + ct.length)
  out[0] = ATTACHMENT_VERSION
  new DataView(out.buffer).setUint16(1, wrapped.length)
  out.set(wrapped, 3)
  out.set(nonce, 3 + wrapped.length)
  out.set(ct, 3 + wrapped.length + nonce.length)
  return out
}

export function decryptAttachment(
  keys: AccountKeys,
  id: string,
  blob: Uint8Array,
): { mime: string; bytes: Uint8Array } {
  const what = `attachment ${id}`
  if (blob.length < 3 || blob[0] !== ATTACHMENT_VERSION) throw new DecryptionError(what)
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  const wrappedLength = view.getUint16(1)
  const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  if (blob.length < 3 + wrappedLength + nonceLength) throw new DecryptionError(what)
  const wrapped = sodium.to_string(blob.subarray(3, 3 + wrappedLength))
  const dataKey = open(keys.wrapKey, wrapped, `ak:${id}`, what)
  const nonce = blob.subarray(3 + wrappedLength, 3 + wrappedLength + nonceLength)
  let plain: Uint8Array
  try {
    plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      blob.subarray(3 + wrappedLength + nonceLength),
      `att:${id}`,
      nonce,
      dataKey,
    )
  } catch {
    throw new DecryptionError(what)
  }
  const headerLength = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0)
  const header = JSON.parse(sodium.to_string(plain.subarray(4, 4 + headerLength))) as {
    mime?: string
  }
  return { mime: header.mime ?? 'application/octet-stream', bytes: plain.slice(4 + headerLength) }
}

/**
 * Opens a message sealed to this account's public key (crypto_box_seal), e.g. by the Telegram bot.
 */
export function openSealedBox(keys: AccountKeys, sealedB64: string): string {
  try {
    return sodium.to_string(
      sodium.crypto_box_seal_open(unb64(sealedB64), keys.box.publicKey, keys.box.privateKey),
    )
  } catch {
    throw new DecryptionError('sealed message')
  }
}
