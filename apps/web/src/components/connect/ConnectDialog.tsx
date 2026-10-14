import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Spinner } from '@fixnote/ui'
import { ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { sessionBackend, useAccount } from '../../lib/account/account'
import { useLlm } from '../../lib/assistant/llm'
import {
  answerConnect,
  type ConnectDialogState,
  closeConnect,
  loadConnect,
  useConnectRequest,
} from '../../lib/remote-mcp/connect'
import { ConnectMarks, ConnectScope } from './ConnectParts'

/**
 * `fixnote://connect`: an AI app asks to read the notes, and the connect page in the browser sent
 * the question here (docs/remote-mcp.md, "Connecting"). Always asks: any web page can open such a
 * link, so it shows who asks and where the browser goes back to. Allow and Deny answer Supabase
 * with this app's session; the page in the browser then goes back to the AI app by itself.
 */
export function ConnectDialog() {
  const { t } = useTranslation()
  const { id, at } = useConnectRequest()
  const phase = useAccount((s) => s.phase)
  const localOnly = useLlm((s) => s.localOnly)
  const [state, setState] = useState<ConnectDialogState>({ kind: 'loading' })
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null)

  // Again for each link (`at`), and once the account has loaded after a start by the link.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `at` marks a new request
  useEffect(() => {
    if (!id) return
    setState({ kind: 'loading' })
    setBusy(null)
    if (phase === 'loading') return
    let gone = false
    void loadConnect(sessionBackend()?.remoteMcp ?? null, id, { localOnly }).then((s) => {
      if (!gone) setState(s)
    })
    return () => {
      gone = true
    }
  }, [id, at, phase, localOnly])

  if (!id) return null

  const answer = async (allow: boolean) => {
    const api = sessionBackend()?.remoteMcp
    if (!api) return
    setBusy(allow ? 'allow' : 'deny')
    const r = await answerConnect(api, id, state, allow)
    setBusy(null)
    if (r === 'failed') return setState({ kind: 'invalid' })
    closeConnect()
    if (r === 'unsent') toast.error(t('connect.unsent'))
    else toast(allow ? t('connect.doneAllowed') : t('connect.doneDenied'))
  }

  const actions = (allowLabel: string, denyLabel: string) => (
    <div className="mt-6 grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        loading={busy === 'deny'}
        disabled={busy !== null && busy !== 'deny'}
        onClick={() => void answer(false)}
      >
        {denyLabel}
      </Button>
      <Button
        loading={busy === 'allow'}
        disabled={busy !== null && busy !== 'allow'}
        onClick={() => void answer(true)}
      >
        {allowLabel}
      </Button>
    </div>
  )

  const message = (title: string, text: string) => (
    <>
      <DialogTitle className="text-center text-lg font-semibold">{title}</DialogTitle>
      <DialogDescription className="mt-2 text-center text-sm text-muted-foreground">
        {text}
      </DialogDescription>
      <Button className="mt-6 w-full" variant="outline" onClick={closeConnect}>
        {t('connect.cancel')}
      </Button>
    </>
  )

  return (
    <Dialog open onOpenChange={(open) => (open || busy ? undefined : closeConnect())}>
      <DialogContent className="max-w-md p-6" data-back-layer>
        <div className="mb-5">
          <ConnectMarks client={state.kind === 'ask' ? state.details.client : null} />
        </div>
        {state.kind === 'loading' ? (
          <>
            <DialogTitle className="sr-only">{t('connect.titleAny')}</DialogTitle>
            <div className="grid place-items-center py-6">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          </>
        ) : state.kind === 'signed-out' ? (
          message(
            t('connect.titleAny'),
            state.reason === 'local-only' ? t('connect.localOnly') : t('connect.signedOut'),
          )
        ) : state.kind === 'invalid' ? (
          message(t('connect.declinedTitle'), t('connect.invalid'))
        ) : state.kind === 'again' ? (
          <>
            <DialogTitle className="text-center text-lg font-semibold">
              {t('connect.againTitle')}
            </DialogTitle>
            <DialogDescription className="mt-2 text-center text-sm text-muted-foreground">
              {t('connect.againBody')}
            </DialogDescription>
            {actions(t('connect.continue'), t('connect.cancel'))}
          </>
        ) : (
          <>
            <DialogTitle className="text-center text-lg font-semibold text-balance">
              {t('connect.title', { client: state.details.client.name })}
            </DialogTitle>
            <DialogDescription className="mt-1 mb-4 text-center text-sm text-muted-foreground">
              {state.details.client.site
                ? t('connect.fromSite', { site: state.details.client.site })
                : t('connect.account', { email: state.details.email })}
            </DialogDescription>
            <ConnectScope />
            {state.pro ? null : (
              <p className="mt-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm">
                {t('connect.notPro')}
              </p>
            )}
            <div className="mt-4 grid gap-1 text-center text-sm">
              <p className="font-medium">
                {t('connect.returnTo', { host: state.details.redirectHost })}
              </p>
              {state.details.client.site ? (
                <p className="text-muted-foreground">
                  {t('connect.account', { email: state.details.email })}
                </p>
              ) : null}
            </div>
            <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand" />
              {t('connect.dialogWarning', { host: state.details.redirectHost })}
            </p>
            {actions(t('connect.allow'), t('connect.deny'))}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
