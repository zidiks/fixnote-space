import { secretToPhrase } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, ConfirmDialog, cn, Input } from '@fixnote/ui'
import { Copy, Eye, EyeOff, LogOut, RefreshCw } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  backToEmail,
  backToPhrase,
  currentSecret,
  finishNewAccount,
  phraseSaved,
  runSync,
  sendCode,
  signOut,
  unlockWithPhrase,
  useAccount,
  verifyCode,
} from '../../lib/account/account'
import { formatRelative } from '../../lib/time'
import { TelegramSection } from './TelegramSection'

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="space-y-1.5">
      <h3 className="font-medium">{title}</h3>
      {body ? <p className="max-w-md text-sm text-muted-foreground">{body}</p> : null}
    </div>
  )
}

function ErrorText({ children }: { children: string | null }) {
  return children ? (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  ) : null
}

function PhraseGrid({ phrase }: { phrase: string }) {
  return (
    <ol data-selectable className="grid max-w-md grid-cols-3 gap-2" aria-label="recovery phrase">
      {phrase.split(' ').map((word, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: words can repeat; position is the identity
          key={i}
          className="flex items-baseline gap-2 rounded-md border bg-card px-2.5 py-1.5 font-mono text-sm"
        >
          <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
          {word}
        </li>
      ))}
    </ol>
  )
}

function useBusy() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>, fail: (err: unknown) => string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(fail(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

function SignIn() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const { busy, error, setError, run } = useBusy()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t('account.badEmail'))
    void run(
      () => sendCode(email),
      () => t('account.sendFailed'),
    )
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Heading title={t('account.signInTitle')} body={t('account.signInBody')} />
      <div className="flex max-w-md gap-2">
        <Input
          type="email"
          autoComplete="email"
          placeholder={t('account.email')}
          aria-label={t('account.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {t('account.sendCode')}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  )
}

function EnterCode() {
  const { t } = useTranslation()
  const email = useAccount((s) => s.email)
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(30)
  const { busy, error, run } = useBusy()

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    void run(
      () => verifyCode(code),
      () => t('account.badCode'),
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Heading title={t('account.signInTitle')} body={t('account.codeSent', { email })} />
      <div className="flex max-w-md gap-2">
        <Input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          placeholder="123456"
          aria-label={t('account.code')}
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '')
            setCode(digits)
          }}
          className="max-w-40 font-mono text-lg tracking-[0.3em]"
        />
        <Button type="submit" disabled={busy || code.length < 6}>
          {t('account.verify')}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-3 text-sm">
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          disabled={cooldown > 0 || busy}
          onClick={() =>
            void run(
              async () => {
                await sendCode(email)
                setCooldown(30)
              },
              () => t('account.sendFailed'),
            )
          }
        >
          {cooldown > 0 ? t('account.resendIn', { seconds: cooldown }) : t('account.resend')}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-muted-foreground"
          onClick={backToEmail}
        >
          {t('account.changeEmail')}
        </Button>
      </div>
    </form>
  )
}

function NewPhrase() {
  const { t } = useTranslation()
  const secret = useAccount((s) => s.pendingSecret)
  const phrase = useMemo(() => (secret ? secretToPhrase(secret) : ''), [secret])
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-4">
      <Heading title={t('account.newTitle')} body={t('account.newBody')} />
      <PhraseGrid phrase={phrase} />
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(phrase).then(() => setCopied(true))
          }}
        >
          <Copy />
          {copied ? t('account.copied') : t('account.copy')}
        </Button>
        <Button onClick={phraseSaved}>{t('account.saved')}</Button>
      </div>
    </div>
  )
}

function ConfirmPhrase() {
  const { t } = useTranslation()
  const secret = useAccount((s) => s.pendingSecret)
  const words = useMemo(() => (secret ? secretToPhrase(secret).split(' ') : []), [secret])
  const picks = useMemo(() => {
    const order = [...words.keys()].sort(() => Math.random() - 0.5)
    return order.slice(0, 3).sort((a, b) => a - b)
  }, [words])
  const [answers, setAnswers] = useState<string[]>(['', '', ''])
  const { busy, error, setError, run } = useBusy()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const ok = picks.every((idx, i) => answers[i]?.trim().toLowerCase() === words[idx])
    if (!ok) return setError(t('account.confirmWrong'))
    void run(finishNewAccount, (err) => (err instanceof Error ? err.message : String(err)))
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Heading title={t('account.confirmTitle')} body={t('account.confirmBody')} />
      <div className="grid max-w-md grid-cols-3 gap-2">
        {picks.map((idx, i) => (
          <div key={idx} className="space-y-1">
            <span className="text-xs text-muted-foreground">
              {t('account.wordN', { n: idx + 1 })}
            </span>
            <Input
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={answers[i]}
              onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
              aria-label={t('account.wordN', { n: idx + 1 })}
              className="font-mono"
            />
          </div>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={backToPhrase}>
          {t('nav.back')}
        </Button>
        <Button type="submit" disabled={busy || answers.some((a) => !a.trim())}>
          {t('account.confirm')}
        </Button>
      </div>
    </form>
  )
}

function Unlock() {
  const { t } = useTranslation()
  const [phrase, setPhrase] = useState('')
  const { busy, error, setError, run } = useBusy()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(
      async () => {
        const res = await unlockWithPhrase(phrase)
        if (res === 'invalid') setError(t('account.phraseInvalid'))
        if (res === 'wrong') setError(t('account.phraseWrong'))
      },
      (err) => (err instanceof Error ? err.message : String(err)),
    )
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Heading title={t('account.unlockTitle')} body={t('account.unlockBody')} />
      <textarea
        rows={3}
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        aria-label={t('account.phrase')}
        placeholder={t('account.phrase')}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full max-w-md resize-none rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !phrase.trim()}>
          {t('account.unlock')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void signOut()}>
          {t('account.signOut')}
        </Button>
      </div>
    </form>
  )
}

function Ready() {
  const { t, i18n } = useTranslation()
  const email = useAccount((s) => s.email)
  const sync = useAccount((s) => s.sync)
  const [showPhrase, setShowPhrase] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)
  const secret = currentSecret()

  const status =
    sync.status === 'syncing'
      ? t('account.status.syncing')
      : sync.status === 'offline'
        ? t('account.status.offline')
        : sync.status === 'error'
          ? t('account.status.error', { message: sync.error ?? '' })
          : sync.lastSyncedAt
            ? t('account.status.synced', {
                time: formatRelative(sync.lastSyncedAt, i18n.resolvedLanguage),
              })
            : t('account.status.never')

  return (
    <div className="space-y-5">
      <Heading title={t('account.signedInAs', { email })} />
      <div className="flex items-center gap-3">
        <p
          aria-live="polite"
          className={cn(
            'text-sm',
            sync.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {status}
          {sync.pending ? ` · ${t('account.status.pending', { count: sync.pending })}` : ''}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void runSync()}
          disabled={sync.status === 'syncing'}
        >
          <RefreshCw className={cn(sync.status === 'syncing' && 'animate-spin')} />
          {t('account.syncNow')}
        </Button>
      </div>
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3"
          onClick={() => setShowPhrase((v) => !v)}
        >
          {showPhrase ? <EyeOff /> : <Eye />}
          {showPhrase ? t('account.hidePhrase') : t('account.showPhrase')}
        </Button>
        {showPhrase && secret ? <PhraseGrid phrase={secretToPhrase(secret)} /> : null}
      </div>
      <TelegramSection />
      <Button variant="outline" onClick={() => setConfirmOut(true)}>
        <LogOut />
        {t('account.signOut')}
      </Button>
      <ConfirmDialog
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title={t('account.signOut')}
        description={t('account.signOutBody')}
        confirmLabel={t('account.signOut')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void signOut()}
      />
    </div>
  )
}

export function AccountSection() {
  const { t } = useTranslation()
  const phase = useAccount((s) => s.phase)
  const ownerEmail = useAccount((s) => s.ownerEmail)
  switch (phase) {
    case 'disabled':
      return <p className="text-sm text-muted-foreground">{t('account.notConfigured')}</p>
    case 'loading':
      return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
    case 'signed-out':
      return <SignIn />
    case 'code-sent':
      return <EnterCode />
    case 'new-account':
      return <NewPhrase />
    case 'confirm-phrase':
      return <ConfirmPhrase />
    case 'needs-phrase':
      return <Unlock />
    case 'wrong-account':
      return (
        <div className="space-y-4">
          <Heading
            title={t('account.wrongAccountTitle')}
            body={t('account.wrongAccountBody', { email: ownerEmail })}
          />
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut />
            {t('account.signOut')}
          </Button>
        </div>
      )
    case 'ready':
      return <Ready />
  }
}
