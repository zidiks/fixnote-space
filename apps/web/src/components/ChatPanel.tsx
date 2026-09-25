import { useTranslation } from '@fixnote/i18n'
import {
  Badge,
  Button,
  Kbd,
  shortcutLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@fixnote/ui'
import { ArrowUp, Layers, X } from 'lucide-react'
import { useUi } from '../app/store'
import { AssistantOrb } from './AssistantOrb'

/**
 * Single app-wide assistant thread. The scope badge shows which notes answers draw from; scope
 * changes insert a divider into the thread (M3).
 */
export function ChatPanel() {
  const { t } = useTranslation()
  const setChatOpen = useUi((s) => s.setChatOpen)
  const draft = useUi((s) => s.chatDraft)
  const setDraft = useUi((s) => s.setChatDraft)

  return (
    <aside
      className="flex h-full w-[380px] shrink-0 flex-col border-l bg-background"
      aria-label={t('chat.title')}
    >
      <header data-tauri-drag-region className="flex h-12 items-center gap-2.5 border-b px-4">
        <AssistantOrb size={22} />
        <span className="flex-1 text-sm font-medium">{t('chat.title')}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setChatOpen(false)}
              aria-label={t('chat.close')}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t('chat.close')}{' '}
            <Kbd className="border-transparent bg-primary-foreground/15 text-primary-foreground">
              {shortcutLabel('J')}
            </Kbd>
          </TooltipContent>
        </Tooltip>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <AssistantOrb size={40} />
        <p className="text-sm text-muted-foreground">{t('chat.empty')}</p>
      </div>

      <div className="border-t p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t('chat.scope.label')}</span>
          <Badge variant="outline">
            <Layers />
            {t('chat.scope.all')}
          </Badge>
        </div>
        <div className="flex items-end gap-1.5 rounded-xl border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring/30">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            className="flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button size="icon-xs" className="rounded-lg" disabled aria-label={t('quickInput.ask')}>
            <ArrowUp />
          </Button>
        </div>
      </div>
    </aside>
  )
}
