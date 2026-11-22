import type { VoiceClip } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import { Pause, Play } from 'lucide-react'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { usePlatform } from '../../lib/platform'
import { typedAudio } from '../../lib/voice/audio-type'

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * A question asked by voice, like a voice message in a messenger: play it back, see where it is,
 * and read what was heard under it. The recording lives only on this device.
 */
export function VoiceMessage({
  voice,
  transcript,
  positions,
  onActivity,
}: {
  voice: VoiceClip
  transcript: string
  positions: RefObject<Map<string, number>>
  onActivity: (active: boolean) => void
}) {
  const { t } = useTranslation()
  const platform = usePlatform()
  const audio = useRef<HTMLAudioElement | null>(null)
  const mounted = useRef(false)
  const loading = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(() => positions.current.get(voice.key) ?? 0)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const a = audio.current
      if (!a) return
      a.pause()
      URL.revokeObjectURL(a.src)
    }
  }, [])

  const toggle = async () => {
    if (loading.current) return
    let a = audio.current
    if (!a) {
      loading.current = true
      onActivity(true)
      const blob = await platform.blobs
        .get(voice.key)
        .then((blob) => blob && typedAudio(blob))
        .catch(() => null)
      loading.current = false
      if (!mounted.current) return
      if (!blob) {
        setMissing(true)
        onActivity(false)
        return
      }
      a = new Audio(URL.createObjectURL(blob))
      a.currentTime = at / 1000
      a.ontimeupdate = () => setAt((a?.currentTime ?? 0) * 1000)
      a.onended = () => {
        setPlaying(false)
        setAt(0)
        positions.current.delete(voice.key)
        onActivity(false)
      }
      audio.current = a
    }
    if (a.paused) {
      onActivity(true)
      await a.play().catch(() => setMissing(true))
      setPlaying(!a.paused)
      if (a.paused) onActivity(false)
    } else {
      a.pause()
      const pausedAt = a.currentTime * 1000
      positions.current.set(voice.key, pausedAt)
      setAt(pausedAt)
      setPlaying(false)
      onActivity(false)
    }
  }

  const progress = voice.durationMs ? Math.min(1, at / voice.durationMs) : 0
  const bars = voice.peaks.length ? voice.peaks : Array.from({ length: 24 }, () => 0.2)
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1">
      <div className="flex items-center gap-2.5 rounded-2xl rounded-br-md bg-muted py-2 pr-3 pl-2">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={missing}
          aria-label={playing ? t('voice.pause') : t('voice.play')}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
        >
          {playing ? (
            <Pause className="size-3.5 fill-current" />
          ) : (
            <Play className="ml-0.5 size-3.5 fill-current" />
          )}
        </button>
        <div className="flex h-7 items-center gap-[2px]" aria-hidden>
          {bars.map((p, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: bars never reorder
              key={i}
              className={cn(
                'w-[3px] rounded-full transition-colors',
                (i + 0.5) / bars.length <= progress ? 'bg-brand' : 'bg-foreground/25',
              )}
              style={{ height: `${Math.max(12, Math.round(p * 100))}%` }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {clock(playing || at ? at : voice.durationMs)}
        </span>
      </div>
      <p
        data-selectable
        className="max-w-full px-1 text-right text-[13px] leading-snug whitespace-pre-wrap text-muted-foreground"
      >
        {transcript}
      </p>
    </div>
  )
}
