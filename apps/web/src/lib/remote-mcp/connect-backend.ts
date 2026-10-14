import { createClient } from '@supabase/supabase-js'
import { env } from '../env'
import { supabase } from '../supabase'
import { type ConsentAuth, type PollAnswer, pollRelay, supabaseConsent } from './consent'

/**
 * What the connect page needs from the server. It never opens the local database or starts the
 * account: a session made here lives only in this tab.
 */
export interface ConnectBackend {
  /** The web app's session in this browser, if it has one. */
  stored(): Promise<ConsentAuth | null>
  sendCode(email: string, lang: string): Promise<boolean>
  /** Signs in for this tab only; null when the code is wrong. */
  verifyCode(email: string, code: string): Promise<ConsentAuth | null>
  /** The app's answer at the relay. */
  poll(authorizationId: string): Promise<PollAnswer>
  /** Opens a fixnote:// link (the app asks the browser's permission first). */
  openApp(link: string): void
}

const devBackendWanted = () =>
  import.meta.env.DEV && new URLSearchParams(location.search).has('dev-backend')

export async function connectBackend(): Promise<ConnectBackend | null> {
  if (devBackendWanted()) {
    const [{ devBackend }, dev] = await Promise.all([
      import('../account/dev-backend'),
      import('./dev'),
    ])
    // `&dev-signed-out`: try the page as a browser without the web app's session.
    const ignoreStored = new URLSearchParams(location.search).has('dev-signed-out')
    return {
      stored: async () => {
        const s = ignoreStored ? null : await devBackend.getSession()
        return s ? dev.devConsent(() => s.email) : null
      },
      sendCode: async () => true,
      verifyCode: async (email, code) => (code === '123456' ? dev.devConsent(() => email) : null),
      poll: dev.devPoll,
      openApp: dev.openDevLink,
    }
  }
  const { supabaseUrl: url, supabaseAnonKey: key } = env
  const app = supabase
  if (!app || !url || !key) return null
  const tab = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return {
    stored: async () => ((await app.auth.getSession()).data.session ? supabaseConsent(app) : null),
    sendCode: async (email, lang) => {
      const { error } = await tab.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, data: { lang } },
      })
      return !error
    },
    verifyCode: async (email, code) => {
      const { error } = await tab.auth.verifyOtp({ email, token: code, type: 'email' })
      return error ? null : supabaseConsent(tab)
    },
    poll: (id) => pollRelay(env.mcpUrl, id),
    openApp: (link) => {
      location.href = link
    },
  }
}
