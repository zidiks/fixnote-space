import { useTranslation } from '@fixnote/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Spinner } from '@fixnote/ui'
import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { readImageText } from '../../lib/ocr'

type State =
  | { phase: 'reading'; progress: number | null }
  | { phase: 'done'; text: string }
  | { phase: 'failed'; message: string }

/** The text read from an image (on this device), to copy. */
export function ImageTextDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ phase: 'reading', progress: null })

  useEffect(() => {
    let alive = true
    readImageText(id, (p) => {
      if (alive && p < 1) setState({ phase: 'reading', progress: p })
    }).then(
      (text) => alive && setState({ phase: 'done', text }),
      (err: unknown) =>
        alive &&
        setState({ phase: 'failed', message: err instanceof Error ? err.message : String(err) }),
    )
    return () => {
      alive = false
    }
  }, [id])

  const copy = async () => {
    if (state.phase !== 'done') return
    await navigator.clipboard.writeText(state.text)
    toast(t('ocr.copied'))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="text-base font-semibold">{t('ocr.title')}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {t('ocr.local')}
        </DialogDescription>
        {state.phase === 'reading' ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner />
            {state.progress === null
              ? t('ocr.reading')
              : t('ocr.downloading', { percent: Math.round(state.progress * 100) })}
          </p>
        ) : state.phase === 'failed' ? (
          <p className="py-6 text-sm text-destructive">
            {t('ocr.failed', { message: state.message })}
          </p>
        ) : state.text ? (
          <pre
            data-selectable
            className="mt-4 max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-sans text-sm whitespace-pre-wrap"
          >
            {state.text}
          </pre>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">{t('ocr.empty')}</p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('window.close')}
          </Button>
          <Button onClick={copy} disabled={state.phase !== 'done' || !state.text}>
            <Copy />
            {t('ocr.copy')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
