import { connectLink } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, Input, Spinner } from '@fixnote/ui'
import { CircleX, Download, Lock } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useReducer, useRef, useState } from 'react'
import type { ConnectBackend } from '../../lib/remote-mcp/connect-backend'
import { connectBackend } from '../../lib/remote-mcp/connect-backend'
import { connectReducer, SLOW_AFTER_MS, waitForAnswer } from '../../lib/remote-mcp/connect-page'
import type { ConsentAuth } from '../../lib/remote-mcp/consent'
import { ConnectMarks, ConnectScope } from './ConnectParts'

const downloadUrl = (lang: string | undefined) =>
  `https://fixnote.space/${lang === 'ru' || lang === 'es' ? `${lang}/` : ''}download/`

/**
 * `/oauth/consent?authorization_id=…`: Supabase Auth's OAuth consent step, when ChatGPT, claude.ai
 * or another AI app connects to FixNote (docs/remote-mcp.md, "Connecting"). A page of its own, not
 * the app: no local database, no account, no sync. It asks the FixNote app to answer
 * (`fixnote://connect`), waits for the answer at the relay and goes back to the AI app; or signs in
 * with an email code that lives only in this tab (phones, no desktop app) and asks right here.
 */
export function ConnectPage({ authorizationId }: { authorizationId: string }) {
  const { t, i18n } = useTranslation()
  const [step, dispatch] = useReducer(connectReducer, { kind: 'loading' })
  const [backend, setBackend] = useState<ConnectBackend | null>(null)
  const [auth, setAuth] = useState<ConsentAuth | null>(null)
  const [busy, setBusy] = useState<'send' | 'verify' | 'allow' | 'deny' | null>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const waiting = useRef<AbortController | null>(null)

  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', dark.matches)
    apply()
    dark.addEventListener('change', apply)
    return () => dark.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    document.title = `${t('connect.pageTitle')} · FixNote`
  }, [t])

  const leave = (url: string, approved: boolean) => {
    dispatch({ type: 'redirect', approved })
    location.replace(url)
  }

  /** Signed in (here or in the web app): the request as this account sees it. */
  const ask = async (a: ConsentAuth) => {
    setAuth(a)
    const found = await a.authorization(authorizationId).catch(() => null)
    if (!found) return dispatch({ type: 'invalid' })
    if (found.kind === 'allowed') return leave(found.redirect, true)
    dispatch({ type: 'details', details: found.details, pro: await a.pro().catch(() => false) })
  }

  // Once per page: `ask` only reads the id the page was opened with.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once
  useEffect(() => {
    void (async () => {
      const b = await connectBackend()
      if (!b || !authorizationId) return dispatch({ type: 'invalid' })
      setBackend(b)
      const stored = await b.stored().catch(() => null)
      if (stored) await ask(stored)
      else dispatch({ type: 'no-session' })
    })()
    return () => waiting.current?.abort()
  }, [])

  const openApp = () => {
    if (!backend) return
    waiting.current?.abort()
    const ctl = new AbortController()
    waiting.current = ctl
    dispatch({ type: 'open-app' })
    backend.openApp(connectLink(authorizationId))
    const slow = setTimeout(() => dispatch({ type: 'slow' }), SLOW_AFTER_MS)
    void waitForAnswer(() => backend.poll(authorizationId), { signal: ctl.signal }).then((r) => {
      clearTimeout(slow)
      if (r === 'aborted') return
      if (r === 'timeout') return dispatch({ type: 'timeout' })
      dispatch({ type: 'answer', result: r })
      if (r.redirect) location.replace(r.redirect)
    })
  }

  const chooseEmail = () => {
    waiting.current?.abort()
    setError('')
    dispatch({ type: 'use-email' })
  }

  const sendCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!backend) return
    const value = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(value)) return setError(t('account.badEmail'))
    setBusy('send')
    setError('')
    const ok = await backend.sendCode(value, i18n.resolvedLanguage ?? 'en').catch(() => false)
    setBusy(null)
    if (ok) dispatch({ type: 'code-sent', email: value })
    else setError(t('account.sendFailed'))
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!backend || step.kind !== 'code') return
    setBusy('verify')
    setError('')
    const a = await backend.verifyCode(step.email, code.trim()).catch(() => null)
    if (!a) {
      setBusy(null)
      return setError(t('account.badCode'))
    }
    await ask(a)
    setBusy(null)
  }

  const decide = async (allow: boolean) => {
    if (!auth) return
    setBusy(allow ? 'allow' : 'deny')
    const url = await auth.decide(authorizationId, allow).catch(() => null)
    if (!url) {
      setBusy(null)
      return dispatch({ type: 'invalid' })
    }
    leave(url, allow)
  }

  const details = step.kind === 'ask' ? step.details : null
  const live = step.kind === 'waiting' || step.kind === 'returning'

  let body: ReactNode
  switch (step.kind) {
    case 'loading':
      body = (
        <div className="grid place-items-center py-6">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      )
      break
    case 'start':
      body = (
        <>
          <Heading title={t('connect.titleAny')} sub={t('connect.intro')} />
          <ConnectScope />
          <div className="grid gap-2">
            <Button size="lg" className="h-11 w-full rounded-xl" onClick={openApp}>
              {t('connect.openApp')}
            </Button>
            <Button variant="ghost" className="w-full rounded-xl" onClick={chooseEmail}>
              {t('connect.useEmail')}
            </Button>
          </div>
        </>
      )
      break
    case 'waiting':
    case 'expired':
      body = (
        <>
          <Heading
            title={step.kind === 'waiting' ? t('connect.waitingTitle') : t('connect.expiredTitle')}
            sub={step.kind === 'waiting' ? t('connect.waitingBody') : t('connect.expiredBody')}
          />
          {step.kind === 'waiting' ? (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {t('connect.waiting')}
            </p>
          ) : null}
          {step.kind === 'expired' || step.slow ? (
            <div className="grid gap-2 border-t pt-4">
              {step.kind === 'waiting' ? (
                <p className="text-center text-sm font-medium">{t('connect.notOpening')}</p>
              ) : null}
              <Button variant="outline" className="w-full rounded-xl" onClick={openApp}>
                {t('connect.openAgain')}
              </Button>
              <Button asChild variant="outline" className="w-full rounded-xl">
                <a href={downloadUrl(i18n.resolvedLanguage)} target="_blank" rel="noreferrer">
                  <Download />
                  {t('connect.download')}
                </a>
              </Button>
              <Button variant="ghost" className="w-full rounded-xl" onClick={chooseEmail}>
                {t('connect.useEmail')}
              </Button>
            </div>
          ) : null}
        </>
      )
      break
    case 'email':
    case 'code':
      body = (
        <>
          <Heading
            title={t('connect.emailTitle')}
            sub={
              step.kind === 'code'
                ? t('account.codeSent', { email: step.email })
                : t('connect.emailBody')
            }
          />
          {step.kind === 'email' ? (
            <form className="grid gap-2" onSubmit={(e) => void sendCode(e)}>
              <Input
                type="email"
                autoComplete="email"
                autoFocus
                className="h-11 rounded-xl text-base sm:text-sm"
                placeholder={t('account.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                type="submit"
                size="lg"
                className="h-11 w-full rounded-xl"
                loading={busy === 'send'}
              >
                {t('account.sendCode')}
              </Button>
            </form>
          ) : (
            <form className="grid gap-2" onSubmit={(e) => void verify(e)}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="h-11 rounded-xl text-center font-mono text-lg tracking-[0.3em]"
                placeholder="000000"
                aria-label={t('account.code')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button
                type="submit"
                size="lg"
                className="h-11 w-full rounded-xl"
                loading={busy === 'verify'}
              >
                {t('account.verify')}
              </Button>
            </form>
          )}
          {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
          <Button
            variant="ghost"
            className="w-full rounded-xl"
            disabled={busy !== null}
            onClick={() => dispatch({ type: 'back' })}
          >
            {t('connect.back')}
          </Button>
        </>
      )
      break
    case 'ask':
      body = (
        <>
          <Heading
            title={t('connect.title', { client: step.details.client.name })}
            sub={
              step.details.client.site
                ? t('connect.fromSite', { site: step.details.client.site })
                : undefined
            }
          />
          <ConnectScope />
          {step.pro ? null : (
            <p className="rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm">
              {t('connect.notPro')}
            </p>
          )}
          <dl className="grid gap-1 text-center text-sm text-muted-foreground">
            <dd className="font-medium text-foreground">
              {t('connect.returnTo', { host: step.details.redirectHost })}
            </dd>
            <dd>{t('connect.account', { email: step.details.email })}</dd>
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="lg"
              className="h-11 rounded-xl"
              loading={busy === 'deny'}
              disabled={busy !== null && busy !== 'deny'}
              onClick={() => void decide(false)}
            >
              {t('connect.deny')}
            </Button>
            <Button
              size="lg"
              className="h-11 rounded-xl"
              loading={busy === 'allow'}
              disabled={busy !== null && busy !== 'allow'}
              onClick={() => void decide(true)}
            >
              {t('connect.allow')}
            </Button>
          </div>
        </>
      )
      break
    case 'returning':
      body = (
        <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Spinner />
          {step.approved ? t('connect.connected') : t('connect.notConnected')}
        </p>
      )
      break
    case 'declined':
      body = (
        <Heading
          icon={<CircleX className="size-6 text-muted-foreground" />}
          title={t('connect.declinedTitle')}
          sub={t('connect.declinedBody')}
        />
      )
      break
    case 'invalid':
      body = (
        <Heading
          icon={<CircleX className="size-6 text-muted-foreground" />}
          title={t('connect.declinedTitle')}
          sub={t('connect.invalid')}
        />
      )
      break
  }

  return (
    <div
      className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-10 text-foreground"
      style={{
        backgroundImage:
          'radial-gradient(60rem 30rem at 50% -10%, color-mix(in oklch, var(--color-brand) 16%, transparent), transparent 70%)',
      }}
    >
      <main className="w-full max-w-[26rem] rounded-[1.75rem] border bg-card/90 p-6 shadow-float backdrop-blur sm:p-8">
        <div className="grid gap-5">
          {step.kind === 'invalid' || step.kind === 'declined' ? null : (
            <ConnectMarks client={details?.client ?? null} live={live} />
          )}
          {body}
        </div>
      </main>
      <p className="mt-5 flex max-w-[26rem] items-start gap-2 px-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        {t('connect.privacy')}
      </p>
    </div>
  )
}

function Heading({ title, sub, icon }: { title: string; sub?: string; icon?: ReactNode }) {
  return (
    <header className="grid gap-1.5 text-center">
      {icon ? <div className="mx-auto">{icon}</div> : null}
      <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
      {sub ? <p className="text-sm text-pretty text-muted-foreground">{sub}</p> : null}
    </header>
  )
}
