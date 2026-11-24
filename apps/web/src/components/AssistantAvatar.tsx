import type { BloubState } from '@fixnote/ui/bloub'
import { lazy, Suspense } from 'react'
import { useAssistant } from '../lib/assistant/assistant'
import { useIsDark } from '../lib/useIsDark'
import { useVoice } from '../lib/voice/voice'

const Bloub = lazy(() => import('@fixnote/ui/bloub').then((m) => ({ default: m.Bloub })))

/** Hex twins of --foreground / --background, which the avatar needs for its color math. */
const COLORS = {
  light: { ink: '#1f1d1b', paper: '#fcfbf9' },
  dark: { ink: '#ecebe8', paper: '#1b1a18' },
}

/** Bloub, reflecting what the assistant is doing. */
export function AssistantAvatar({ size, follow = false }: { size: number; follow?: boolean }) {
  const dark = useIsDark()
  const status = useAssistant((s) => s.status)
  const semantic = useAssistant((s) => s.semantic)
  const pending = useAssistant((s) => s.pending)
  const listening = useVoice((s) => s.status === 'recording')

  const state: BloubState = listening
    ? 'notify'
    : status === 'thinking'
      ? 'thinking'
      : status === 'answering'
        ? 'wide'
        : status === 'done'
          ? 'wink'
          : status === 'error'
            ? 'alert'
            : semantic === 'loading' || (semantic === 'ready' && pending > 0)
              ? 'orbit'
              : 'idle'

  return (
    <Suspense
      fallback={
        <span aria-hidden className="inline-block shrink-0" style={{ width: size, height: size }} />
      }
    >
      <Bloub size={size} state={state} follow={follow} {...COLORS[dark ? 'dark' : 'light']} />
    </Suspense>
  )
}
