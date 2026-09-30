import { useTranslation } from '@fixnote/i18n'
import { ConfirmDialog } from '@fixnote/ui'
import { useEffect, useState } from 'react'
import { usePlatform } from '../lib/platform'
import { cancelCall } from '../lib/voice/call'

/**
 * The desktop app's tray: its menu in the app's language, and the question asked when someone
 * quits while a call is being recorded (closing the window only hides it).
 */
export function QuitDialog() {
  const { t } = useTranslation()
  const tray = usePlatform().tray
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    void tray?.labels(t('tray.open'), t('tray.quit')).catch(() => undefined)
  }, [tray, t])

  useEffect(() => {
    if (!tray) return
    const off = tray.onQuitRequested(() => setAsking(true))
    return () => void off.then((unlisten) => unlisten())
  }, [tray])

  if (!tray) return null
  return (
    <ConfirmDialog
      open={asking}
      onOpenChange={setAsking}
      title={t('call.quitTitle')}
      description={t('call.quitBody')}
      confirmLabel={t('call.quitConfirm')}
      cancelLabel={t('call.stay')}
      destructive
      onConfirm={() => {
        setAsking(false)
        cancelCall()
        void tray.quit()
      }}
    />
  )
}
