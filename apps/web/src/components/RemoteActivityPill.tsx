import type { RemoteActivity } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import { RadioTower } from 'lucide-react'
import { useUi } from '../app/store'
import { useRemoteActivity } from '../lib/remote-mcp/bridge'

const ACTIONS = ['search_notes', 'get_note', 'list_recent', 'list_folders', 'daily_note'] as const
type Action = (typeof ACTIONS)[number] | 'other'
const action = (tool: string): Action =>
  (ACTIONS as readonly string[]).includes(tool) ? (tool as Action) : 'other'

/** The i18n key of what a tool does ("searching notes"). */
export const actionKey = (tool: string) => `remoteMcp.action_${action(tool)}` as const

/** "Claude · searching notes": what a remote app is doing on this device, in the UI language. */
export function useActivityText(a: RemoteActivity | null): string {
  const { t } = useTranslation()
  if (!a) return ''
  return t('remoteMcp.activity', {
    client: a.client,
    action: t(actionKey(a.tool)),
  })
}

/**
 * A quiet pill in the title bar while a remote MCP app (ChatGPT, claude.ai) is reading notes on
 * this device, fading out a moment after its last call. Never takes focus; a click opens
 * Settings → Integrations. On narrow screens only the dot and the app's name.
 */
export function RemoteActivityPill() {
  const { t } = useTranslation()
  const shown = useRemoteActivity((s) => s.shown)
  const running = useRemoteActivity((s) => s.running.length > 0)
  const narrow = useUi((s) => s.narrow)
  const text = useActivityText(shown)
  if (!shown) return null
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => useUi.getState().openSettings('integrations')}
      title={t('remoteMcp.activityLabel', { client: shown.client })}
      aria-label={t('remoteMcp.activityLabel', { client: shown.client })}
      className={cn(
        'flex h-6 max-w-[40vw] items-center gap-1.5 rounded-full border bg-muted/60 px-2 text-xs text-muted-foreground',
        'transition-opacity duration-500 motion-reduce:transition-none hover:text-foreground',
        running ? 'opacity-100' : 'opacity-60',
      )}
    >
      <RadioTower
        className={cn('size-3 shrink-0 text-brand', running && 'motion-safe:animate-pulse')}
        aria-hidden
      />
      <span className="truncate">{narrow ? shown.client : text}</span>
    </button>
  )
}
