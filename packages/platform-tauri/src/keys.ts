import type { KeyStore } from '@fixnote/core'
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
