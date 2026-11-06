import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Spinner } from '@fixnote/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Globe, ShieldAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { sessionBackend, useAccount } from '../../lib/account/account'
import { useLlm } from '../../lib/assistant/llm'
import { closeExtension, useExtensionRequest } from '../../lib/extension-connect'
import { usePlan } from '../../lib/plan'

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out'; reason: 'signed-out' | 'local-only' }
  | { kind: 'ask'; label: string; code: string }
  | { kind: 'invalid' }

/**
 * The browser extension's "Connect" asks here (`lib/extension-connect.ts`). Always asks, with the
 * code the extension shows: any page can open the link, and a browser connected by mistake could
 * add to the person's notes (never read them).
 */
export function ExtensionConnectDialog() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { id, at } = useExtensionRequest()
  const phase = useAccount((s) => s.phase)
  const localOnly = useLlm((s) => s.localOnly)
  const pro = usePlan((s) => s.info?.plan !== 'free')
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null)

  // Again for each link (`at`), and once the account has loaded after a start by the link.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `at` marks a new request
  useEffect(() => {
    if (!id) return
    setState({ kind: 'loading' })
    setBusy(null)
    if (phase === 'loading') return
    if (localOnly) return setState({ kind: 'signed-out', reason: 'local-only' })
    const backend = sessionBackend()
    if (!backend) return setState({ kind: 'signed-out', reason: 'signed-out' })
    let gone = false
    void backend
      .extensionRequest(id)
      .catch(() => null)
      .then((r) => {
        if (!gone) setState(r ? { kind: 'ask', ...r } : { kind: 'invalid' })
      })
    return () => {
      gone = true
    }
  }, [id, at, phase, localOnly])

  if (!id) return null

  const answer = async (allow: boolean) => {
    const backend = sessionBackend()
    if (!backend) return
    setBusy(allow ? 'allow' : 'deny')
    const ok = await backend.answerExtensionRequest(id, allow).catch(() => false)
    setBusy(null)
    if (!ok) return setState({ kind: 'invalid' })
    closeExtension()
    if (allow) void qc.invalidateQueries({ queryKey: ['capture-links'] })
    toast(allow ? t('extension.connected') : t('extension.denied'))
  }

  const marks = (
    <div className="mb-5 flex items-center justify-center gap-3" aria-hidden>
      <span className="grid size-14 place-items-center overflow-hidden rounded-2xl shadow-float">
        <img src="/icon.svg" alt="" className="size-full" />
      </span>
      <span className="flex w-14 items-center justify-between">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-muted-foreground/40" />
        ))}
      </span>
      <span className="grid size-14 place-items-center rounded-2xl border bg-card shadow-float">
        <Globe className="size-6 text-brand" />
      </span>
    </div>
  )

  const message = (text: string) => (
    <>
      <DialogTitle className="text-center text-lg font-semibold">
        {t('extension.askTitle')}
      </DialogTitle>
      <DialogDescription className="mt-2 text-center text-sm text-muted-foreground">
        {text}
      </DialogDescription>
      <Button className="mt-6 w-full" variant="outline" onClick={closeExtension}>
        {t('connect.cancel')}
      </Button>
    </>
  )

  return (
    <Dialog open onOpenChange={(open) => (open || busy ? undefined : closeExtension())}>
      <DialogContent className="max-w-md p-6" data-back-layer>
        {marks}
        {state.kind === 'loading' ? (
          <>
            <DialogTitle className="sr-only">{t('extension.askTitle')}</DialogTitle>
            <div className="grid place-items-center py-6">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          </>
        ) : state.kind === 'signed-out' ? (
          message(
            state.reason === 'local-only' ? t('extension.localOnly') : t('extension.signedOut'),
          )
        ) : state.kind === 'invalid' ? (
          message(t('extension.invalid'))
        ) : (
          <>
            <DialogTitle className="text-center text-lg font-semibold text-balance">
              {t('extension.askTitle')}
            </DialogTitle>
            {state.label ? (
              <DialogDescription className="mt-1 text-center text-sm text-muted-foreground">
                {state.label}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{t('extension.codeHint')}</DialogDescription>
            )}

            <div className="mt-5 grid justify-items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t('extension.codeLabel')}
              </span>
              <span className="sr-only">{state.code}</span>
              <div className="flex gap-1.5" aria-hidden>
                {[...state.code].map((ch, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed letters of one code
                    key={i}
                    className="grid h-12 w-10 place-items-center rounded-xl border bg-card font-mono text-2xl font-semibold"
                  >
                    {ch}
                  </span>
                ))}
              </div>
              <span className="text-center text-sm text-muted-foreground">
                {t('extension.codeHint')}
              </span>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl bg-muted/60 p-4 text-sm">
              <section>
                <h2 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('connect.can')}
                </h2>
                <p className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {t('extension.canSave')}
                </p>
              </section>
              <section>
                <h2 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('connect.cannot')}
                </h2>
                <p className="flex gap-2">
                  <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {t('extension.cannotRead')}
                </p>
              </section>
            </div>
            {pro ? null : (
              <p className="mt-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm">
                {t('extension.notPro')}
              </p>
            )}
            <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand" />
              {t('extension.warning')}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                loading={busy === 'deny'}
                disabled={busy !== null && busy !== 'deny'}
                onClick={() => void answer(false)}
              >
                {t('extension.deny')}
              </Button>
              <Button
                loading={busy === 'allow'}
                disabled={busy !== null && busy !== 'allow'}
                onClick={() => void answer(true)}
              >
                {t('extension.connect')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
