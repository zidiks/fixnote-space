import { useTranslation } from '@fixnote/i18n'
import { Bloub, type BloubState, Button } from '@fixnote/ui'
import { Hand, X } from 'lucide-react'
import { useIsDark } from '../../lib/useIsDark'
import { interruptTalk, stopTalk, type TalkPhase, useTalk } from '../../lib/voice/conversation'

const COLORS = {
  light: { ink: '#1f1d1b', paper: '#fcfbf9' },
  dark: { ink: '#ecebe8', paper: '#1b1a18' },
}

const FACE: Record<Exclude<TalkPhase, 'off'>, BloubState> = {
  starting: 'orbit',
  listening: 'idle',
  hearing: 'notify',
  transcribing: 'orbit',
  thinking: 'thinking',
  speaking: 'wide',
}

/**
 * The input while talking with the assistant: Bloub shows what is going on (listening, hearing
 * you, thinking, answering) and breathes with the microphone; End stops the conversation.
 */
export function TalkPanel() {
  const { t } = useTranslation()
  const dark = useIsDark()
  const phase = useTalk((s) => s.phase)
  const level = useTalk((s) => s.level)
  const download = useTalk((s) => s.download)
  if (phase === 'off') return null
  const hearing = phase === 'listening' || phase === 'hearing'
  const label =
    download !== null
      ? t('voice.downloading', { percent: Math.round(download * 100) })
      : t(`talk.${phase}`)

  return (
    <section
      aria-label={t('talk.start')}
      className="flex items-center gap-3 rounded-xl border bg-card p-3"
    >
      <div className="relative flex size-16 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-brand/15 transition-transform duration-100"
          style={{ transform: `scale(${hearing ? 0.7 + Math.min(level, 1) * 0.6 : 0.7})` }}
        />
        <Bloub size={52} state={FACE[phase]} {...COLORS[dark ? 'dark' : 'light']} />
      </div>
      <p role="status" className="min-w-0 flex-1 text-sm text-muted-foreground">
        {label}
      </p>
      {phase === 'speaking' ? (
        <Button size="sm" variant="outline" onClick={interruptTalk}>
          <Hand />
          {t('talk.interrupt')}
        </Button>
      ) : null}
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={stopTalk}
        aria-label={t('talk.end')}
        title={t('talk.end')}
      >
        <X />
      </Button>
    </section>
  )
}
