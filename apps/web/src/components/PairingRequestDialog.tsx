import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@fixnote/ui'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { approvePairing, declinePairing, useAccount } from '../lib/account/account'

/**
 * Shown on a set-up device when a new one asks to be let in. Allowing seals the account key to
 * the new device; the matching code is what makes that safe.
 */
export function PairingRequestDialog() {
  const { t } = useTranslation()
  const request = useAccount((s) => s.pairingRequests[0])
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!request || dismissed === request.id) return null

  const act = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true)
    try {
      await fn()
      if (done) toast(done)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : setDismissed(request.id))}>
      <DialogContent className="max-w-md p-6">
        <DialogTitle className="font-semibold">{t('pairing.requestTitle')}</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">
          {t('pairing.requestBody', { device: request.deviceLabel || t('pairing.unknownDevice') })}
        </DialogDescription>
        <p
          data-testid="pairing-code"
          className="mt-4 font-mono text-3xl font-semibold tracking-widest tabular-nums"
        >
          {request.code}
        </p>
        <p className="mt-4 flex gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand" />
          {t('pairing.requestWarning')}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDismissed(request.id)}>
            {t('pairing.later')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void act(() => declinePairing(request))}
          >
            {t('pairing.decline')}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void act(() => approvePairing(request), t('pairing.allowed'))}
          >
            {t('pairing.allow')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
