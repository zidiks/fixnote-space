import { useTranslation } from '@fixnote/i18n'
import { Button, Input, Spinner } from '@fixnote/ui'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { RadioTower } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { env } from '../lib/env'
import { supabase } from '../lib/supabase'
import { ART } from './pro-look'

type Details = { client: string; host: string; email: string; pro: boolean }

type Step =
  | { kind: 'loading' }
  | { kind: 'email' }
  | { kind: 'code'; email: string }
  | { kind: 'ask'; details: Details }
  | { kind: 'returning' }
  | { kind: 'invalid' }

const host = (uri: string) => {
  try {
    return new URL(uri).host
  } catch {
    return uri
  }
}

/**
 * Supabase Auth's OAuth consent step for remote MCP (`/oauth/consent?authorization_id=…`, see
 * [auth.oauth_server] in supabase/config.toml and docs/remote-mcp.md): an AI app asks to read the
 * notes. Like the shared-link page it opens no local database. It uses the web app's session when
 * this browser has one; otherwise the sign-in here lives only in this tab, so it never binds the
 * web app in this browser to an account.
 */
export function OAuthConsentPage({ authorizationId }: { authorizationId: string }) {
  const { t, i18n } = useTranslation()
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'loading' })
  const [busy, setBusy] = useState<'send' | 'verify' | 'allow' | 'deny' | null>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', dark.matches)
    apply()
    dark.addEventListener('change', apply)
    document.title = 'FixNote'
    return () => dark.removeEventListener('change', apply)
  }, [])

  const load = async (c: SupabaseClient) => {
    const { data, error: err } = await c.auth.oauth.getAuthorizationDetails(authorizationId)
    if (err || !data) {
      setStep({ kind: 'invalid' })
      return
    }
    if (!('authorization_id' in data)) {
      // Already allowed before: straight back to the app.
      setStep({ kind: 'returning' })
      location.replace(data.redirect_url)
      return
    }
    const pro = await c.rpc('remote_mcp_allowed')
    setStep({
      kind: 'ask',
      details: {
        client: data.client.name || data.client.id,
        host: host(data.redirect_uri),
        email: data.user.email,
        pro: pro.data === true,
      },
    })
  }

  // Once per page (`load` only reads the id it was opened with).
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once
  useEffect(() => {
    void (async () => {
      if (!supabase || !env.supabaseUrl || !env.supabaseAnonKey) {
        setStep({ kind: 'invalid' })
        return
      }
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setClient(supabase)
        await load(supabase)
        return
      }
      setClient(
        createClient(env.supabaseUrl, env.supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }),
      )
      setStep({ kind: 'email' })
    })()
  }, [])

  const sendCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!client) return
    const value = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setError(t('account.badEmail'))
      return
    }
    setBusy('send')
    setError('')
    const { error: err } = await client.auth.signInWithOtp({
      email: value,
      options: { shouldCreateUser: false, data: { lang: i18n.resolvedLanguage } },
    })
    setBusy(null)
    if (err) setError(t('account.sendFailed'))
    else setStep({ kind: 'code', email: value })
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!client || step.kind !== 'code') return
    setBusy('verify')
    setError('')
    const { error: err } = await client.auth.verifyOtp({
      email: step.email,
      token: code.trim(),
      type: 'email',
    })
    if (err) {
      setBusy(null)
      setError(t('account.badCode'))
      return
    }
    await load(client)
    setBusy(null)
  }

  const decide = async (allow: boolean) => {
    if (!client) return
    setBusy(allow ? 'allow' : 'deny')
    const res = allow
      ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    if (res.error || !res.data) {
      setBusy(null)
      setStep({ kind: 'invalid' })
      return
    }
    setStep({ kind: 'returning' })
    location.replace(res.data.redirect_url)
  }

  return (
    <div className="grid min-h-full place-items-center bg-background p-4 text-foreground">
      <main className="w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-float">
        <div className="h-20" style={ART} aria-hidden />
        <div className="space-y-4 px-6 pt-5 pb-6">
          {step.kind === 'loading' || step.kind === 'returning' ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {step.kind === 'returning' ? t('oauth.returning') : null}
            </p>
          ) : step.kind === 'invalid' ? (
            <p className="text-sm text-muted-foreground">{t('oauth.invalid')}</p>
          ) : step.kind === 'ask' ? (
            <>
              <h1 className="flex items-start gap-2 text-lg font-semibold">
                <RadioTower className="mt-1 size-5 shrink-0 text-brand" />
                {t('oauth.title', { client: step.details.client })}
              </h1>
              <p className="text-sm">{t('oauth.body')}</p>
              <p className="text-sm text-muted-foreground">{t('oauth.scope')}</p>
              <p className="text-sm text-muted-foreground">{t('remoteMcp.privacy')}</p>
              {step.details.pro ? null : (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t('oauth.notPro')}</p>
              )}
              <p className="text-sm">
                {t('oauth.returnTo', { host: step.details.host })}
                <br />
                <span className="text-muted-foreground">
                  {t('oauth.account', { email: step.details.email })}
                </span>
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  loading={busy === 'allow'}
                  disabled={busy !== null && busy !== 'allow'}
                  onClick={() => void decide(true)}
                >
                  {t('oauth.allow')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  loading={busy === 'deny'}
                  disabled={busy !== null && busy !== 'deny'}
                  onClick={() => void decide(false)}
                >
                  {t('oauth.deny')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold">{t('oauth.signInTitle')}</h1>
              <p className="text-sm text-muted-foreground">
                {step.kind === 'code'
                  ? t('account.codeSent', { email: step.email })
                  : t('oauth.signInBody')}
              </p>
              {step.kind === 'email' ? (
                <form className="space-y-2" onSubmit={(e) => void sendCode(e)}>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder={t('account.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button type="submit" className="w-full" loading={busy === 'send'}>
                    {t('account.sendCode')}
                  </Button>
                </form>
              ) : (
                <form className="space-y-2" onSubmit={(e) => void verify(e)}>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={t('account.code')}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <Button type="submit" className="w-full" loading={busy === 'verify'}>
                    {t('account.verify')}
                  </Button>
                </form>
              )}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
