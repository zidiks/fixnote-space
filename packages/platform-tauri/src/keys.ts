import type { KeyStore, SecretStore } from '@fixnote/core'
import { invoke } from '@tauri-apps/api/core'

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

/** The recovery secret in the OS credential store (Windows Credential Manager, macOS Keychain). */
export const osKeyStore: KeyStore = {
  load: async () => {
    const value = await invoke<string | null>('key_load')
    return value ? fromB64(value) : null
  },
  save: (secret) => invoke('key_save', { value: toB64(secret) }),
  clear: () => invoke('key_clear'),
}

/** Other secrets (an LLM API key), also in the OS credential store. */
export const osSecretStore: SecretStore = {
  get: (name) => invoke<string | null>('secret_load', { name }),
  set: (name, value) => invoke('secret_save', { name, value }),
  delete: (name) => invoke('secret_clear', { name }),
}
