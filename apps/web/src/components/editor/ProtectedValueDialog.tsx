import type { ProtectedReference } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@fixnote/ui'
import { useState } from 'react'
import { toast } from 'sonner'

export function ProtectedValueDialog({
  value,
  audience: initialAudience,
  shared,
  onClose,
  onSave,
}: {
  value: string
  audience: ProtectedReference['audience']
  shared: boolean
  onClose: () => void
  onSave: (value: string, audience: ProtectedReference['audience']) => Promise<void>
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const [audience, setAudience] = useState(initialAudience)
  const [busy, setBusy] = useState(false)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent>
        <DialogTitle>{t('privacy.editTitle')}</DialogTitle>
        <DialogDescription>{t('privacy.explain')}</DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!text.trim() || busy) return
            setBusy(true)
            void onSave(text, audience).then(onClose, () => {
              toast.error(t('privacy.saveFailed'))
              setBusy(false)
            })
          }}
        >
          <textarea
            aria-label={t('privacy.editTitle')}
            className="min-h-24 rounded-md border bg-background p-2 text-sm"
            spellCheck={false}
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={busy}
          />
          {shared && initialAudience === 'personal' ? (
            <select
              aria-label={t('privacy.audience')}
              className="rounded-md border bg-background p-2 text-sm"
              value={audience}
              disabled={busy}
              onChange={(event) =>
                setAudience(event.target.value === 'members' ? 'members' : 'personal')
              }
            >
              <option value="personal">{t('privacy.personal')}</option>
              <option value="members">{t('privacy.members')}</option>
            </select>
          ) : null}
          <Button type="submit" className="self-end" loading={busy} disabled={!text.trim()}>
            {t('privacy.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
