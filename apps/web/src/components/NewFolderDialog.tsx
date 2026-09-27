import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogTitle, Input } from '@fixnote/ui'
import { useState } from 'react'
import { toast } from 'sonner'

/** Asks for a folder name; `onCreate` makes the folder (and, from a note, moves the note there). */
export function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const close = (next: boolean) => {
    if (!next) setName('')
    onOpenChange(next)
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm p-6">
        <DialogTitle className="font-semibold">{t('sidebar.newFolder')}</DialogTitle>
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim() || busy) return
            setBusy(true)
            try {
              await onCreate(name.trim())
              close(false)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder={t('sidebar.folderName')}
            aria-label={t('sidebar.folderName')}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || busy}>
              {t('menu.createFolder')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
