import type { TrayMenuItem } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { ConfirmDialog } from '@fixnote/ui'
import { useEffect, useRef, useState } from 'react'
import { useUi } from '../app/store'
import { usePlatform } from '../lib/platform'
import { useCreateNote, useOpenDaily } from '../lib/queries'
import { cancelCall, startCall, stopCall, useCall } from '../lib/voice/call'
import { useCallSupport } from '../lib/voice/call-support'
import { toggleVoice, useVoice } from '../lib/voice/voice'

/**
 * The desktop app's tray (menu bar) icon: its menu in the app's language, following dictation and
 * the call, its quick actions, and the question asked when someone quits during a call (closing
 * the window only hides it; tray.rs).
 */
export function DesktopTray() {
  const { t } = useTranslation()
  const tray = usePlatform().tray
  const canCall = useCallSupport()
  const call = useCall((s) => s.status)
  const voice = useVoice((s) => s.status)
  const createNote = useCreateNote()
  const openDaily = useOpenDaily()
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    if (!tray) return
    const items: TrayMenuItem[] = [
      { id: 'open', text: t('tray.open') },
      {},
      { id: 'new-note', text: t('tray.newNote') },
      {
        id: 'voice',
        text: voice === 'recording' ? t('tray.stopVoice') : t('tray.voice'),
        enabled: (voice === 'idle' || voice === 'recording') && call === 'idle',
      },
      { id: 'today', text: t('tray.today') },
      { id: 'search', text: t('tray.search') },
      ...(canCall
        ? [
            {
              id: 'call',
              text:
                call === 'recording'
                  ? t('tray.stopCall')
                  : call === 'idle'
                    ? t('tray.call')
                    : t('tray.writingUp'),
              enabled: (call === 'idle' && voice === 'idle') || call === 'recording',
            },
          ]
        : []),
      {},
      { id: 'quit', text: t('tray.quit') },
    ]
    void tray
      .menu(items, call === 'recording' ? t('tray.recording') : 'FixNote')
      .catch(() => undefined)
  }, [tray, t, canCall, call, voice])

  // The latest handlers, for the one subscription below.
  const act = useRef<(id: string) => void>(() => {})
  act.current = (id) => {
    const open = (note: { id: string }) => useUi.getState().navigate({ kind: 'note', id: note.id })
    if (id === 'new-note') createNote.mutate({ content: '' }, { onSuccess: open })
    else if (id === 'voice') void toggleVoice('new-note')
    else if (id === 'today') openDaily.mutate(undefined, { onSuccess: open })
    else if (id === 'search') useUi.getState().setSpotlightOpen(true)
    else if (id === 'call') {
      if (useCall.getState().status === 'recording') void stopCall()
      else void startCall()
    }
  }

  useEffect(() => {
    if (!tray) return
    const offAction = tray.onAction((id) => act.current(id))
    const offQuit = tray.onQuitRequested(() => setAsking(true))
    return () => {
      void offAction.then((off) => off())
      void offQuit.then((off) => off())
    }
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
