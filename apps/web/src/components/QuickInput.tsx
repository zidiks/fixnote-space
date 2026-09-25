import { useTranslation } from '@fixnote/i18n'
import { Button, isApple, modKeyLabel, Tooltip, TooltipContent, TooltipTrigger } from '@fixnote/ui'
import { ArrowUp, Mic, Paperclip } from 'lucide-react'
import { useRef, useState } from 'react'
import { useUi } from '../app/store'

/**
 * Bottom capture bar. Enter saves to Inbox, Mod+Enter asks the assistant.
 * Voice and attachments arrive in M4.
 */
export function QuickInput() {
  const { t } = useTranslation()
  const addDraft = useUi((s) => s.addDraft)
  const setChatOpen = useUi((s) => s.setChatOpen)
  const setChatDraft = useUi((s) => s.setChatDraft)
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  const submit = (ask: boolean) => {
    const value = text.trim()
    if (!value) return
    if (ask) {
      setChatDraft(value)
      setChatOpen(true)
    } else {
      addDraft(value)
    }
    setText('')
    requestAnimationFrame(resize)
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-background via-background/80 to-transparent px-4 pt-10 pb-5">
      <div className="pointer-events-auto w-full max-w-xl">
        <div className="flex items-end gap-1 rounded-[22px] bg-neutral-800/92 p-1.5 text-neutral-50 shadow-float backdrop-blur-md dark:bg-neutral-700/80">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled
                className="rounded-full text-neutral-300 hover:bg-white/10 hover:text-white"
                aria-label={t('quickInput.attach')}
              >
                <Paperclip />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('quickInput.attach')}</TooltipContent>
          </Tooltip>
          <textarea
            ref={ref}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              resize()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit(isApple ? e.metaKey : e.ctrlKey)
              }
            }}
            placeholder={t('quickInput.placeholder')}
            aria-label={t('quickInput.placeholder')}
            className="max-h-[200px] min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-5 outline-none placeholder:text-neutral-400"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled
                className="rounded-full text-neutral-300 hover:bg-white/10 hover:text-white"
                aria-label={t('quickInput.voice')}
              >
                <Mic />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('quickInput.voice')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                onClick={() => submit(false)}
                disabled={!text.trim()}
                className="rounded-full bg-white text-neutral-900 hover:bg-white/90 disabled:bg-white/25 disabled:text-neutral-400 disabled:opacity-100"
                aria-label={t('quickInput.save')}
              >
                <ArrowUp />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('quickInput.save')}</TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {t('quickInput.hint', { mod: modKeyLabel })}
        </p>
      </div>
    </div>
  )
}
