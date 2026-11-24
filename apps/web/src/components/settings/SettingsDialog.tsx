import { useTranslation } from '@fixnote/i18n'
import { Button, cn, Dialog, DialogContent, DialogTitle } from '@fixnote/ui'
import {
  Blocks,
  Cpu,
  Database,
  Gem,
  Keyboard,
  Settings2,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { useRef } from 'react'
import { type SettingsSection, useUi } from '../../app/store'
import { useBackLayer } from '../../lib/nav-history'
import { SLIDING_INDICATOR, SlidingIndicator } from '../SlidingIndicator'
import { AccountSection } from './AccountSection'
import { AdvancedSection } from './AdvancedSection'
import { AiSection } from './AiSection'
import { DataSection } from './DataSection'
import { GeneralSection } from './GeneralSection'
import { IntegrationsSection } from './IntegrationsSection'
import { PlanSection } from './PlanSection'
import { ShortcutsSection } from './ShortcutsSection'

const SECTIONS: { id: SettingsSection; icon: typeof Settings2 }[] = [
  { id: 'general', icon: Settings2 },
  { id: 'account', icon: UserRound },
  { id: 'plan', icon: Gem },
  { id: 'integrations', icon: Blocks },
  { id: 'ai', icon: Sparkles },
  { id: 'data', icon: Database },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'advanced', icon: Cpu },
]

export function SettingsDialog() {
  const { t } = useTranslation()
  const navRef = useRef<HTMLElement>(null)
  const section = useUi((s) => s.settings)
  const open = useUi((s) => s.openSettings)
  useBackLayer(section !== null, () => open(null))

  return (
    <Dialog open={section !== null} onOpenChange={(o) => !o && open(null)}>
      <DialogContent
        data-back-layer
        aria-describedby={undefined}
        className={cn(
          'top-1/2 left-1/2 flex h-[min(700px,84dvh)] max-h-[84dvh] w-[min(980px,calc(100vw-3rem))] max-w-none -translate-x-1/2 -translate-y-1/2 overflow-hidden p-0',
          // A phone: the whole screen, sections as a row of tabs above.
          'max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-full max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <nav
          ref={navRef}
          className="relative flex w-48 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2.5 max-sm:w-full max-sm:flex-row max-sm:overflow-x-auto max-sm:border-r-0 max-sm:border-b max-sm:pr-12 sm:w-60"
        >
          <DialogTitle className="px-2.5 pt-1.5 pb-3 text-sm font-semibold max-sm:sr-only">
            {t('settings.title')}
          </DialogTitle>
          <SlidingIndicator
            container={navRef}
            activeKey={section}
            className="rounded-md bg-sidebar-accent"
          />
          {SECTIONS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                open(id)
                // A phone: a tab half off the row comes into view.
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }}
              aria-current={section === id ? 'page' : undefined}
              data-active={section === id ? 'true' : undefined}
              className={cn(
                'relative z-[1] flex min-h-8 items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-[13.5px] leading-tight text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 max-sm:min-h-9 max-sm:shrink-0 max-sm:whitespace-nowrap',
                section === id && 'font-medium text-foreground',
                section === id && !SLIDING_INDICATOR && 'bg-sidebar-accent',
              )}
            >
              <Icon className="size-4 shrink-0 opacity-70" />
              {t(`settings.${id}`)}
            </button>
          ))}
        </nav>
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-3.5 right-3.5 z-10 max-sm:fixed max-sm:top-[calc(env(safe-area-inset-top)+0.625rem)] max-sm:right-2 max-sm:size-9 max-sm:bg-sidebar"
            onClick={() => open(null)}
            aria-label={t('window.close')}
          >
            <X />
          </Button>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:pr-14 sm:py-7">
            <h2 className="mb-5 text-lg font-semibold">
              {section ? t(`settings.${section}`) : ''}
            </h2>
            {section === 'general' ? <GeneralSection /> : null}
            {section === 'account' ? <AccountSection /> : null}
            {section === 'plan' ? <PlanSection /> : null}
            {section === 'integrations' ? <IntegrationsSection /> : null}
            {section === 'ai' ? <AiSection /> : null}
            {section === 'data' ? <DataSection /> : null}
            {section === 'shortcuts' ? <ShortcutsSection /> : null}
            {section === 'advanced' ? <AdvancedSection /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
