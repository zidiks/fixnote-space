import { Bloub, type BloubState } from '@fixnote/ui'
import { useAssistant } from '../lib/assistant/assistant'
import { useIsDark } from '../lib/useIsDark'

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

  const state: BloubState =
    status === 'thinking'
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

  return <Bloub size={size} state={state} follow={follow} {...COLORS[dark ? 'dark' : 'light']} />
}
