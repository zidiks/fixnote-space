import { useTranslation } from '@fixnote/i18n'
import { Button, cn, Dialog, DialogContent, DialogTitle } from '@fixnote/ui'
import { Blocks, Cpu, Database, Gem, Settings2, Sparkles, UserRound, X } from 'lucide-react'
import { type SettingsSection, useUi } from '../../app/store'
import { useBackLayer } from '../../lib/nav-history'
import { AccountSection } from './AccountSection'
import { AdvancedSection } from './AdvancedSection'
import { AiSection } from './AiSection'
import { DataSection } from './DataSection'
import { GeneralSection } from './GeneralSection'
import { IntegrationsSection } from './IntegrationsSection'
import { PlanSection } from './PlanSection'

const SECTIONS: { id: SettingsSection; icon: typeof Settings2 }[] = [
  { id: 'general', icon: Settings2 },
  { id: 'account', icon: UserRound },
  { id: 'plan', icon: Gem },
  { id: 'integrations', icon: Blocks },
  { id: 'ai', icon: Sparkles },
  { id: 'data', icon: Database },
  { id: 'advanced', icon: Cpu },
]

export function SettingsDialog() {
  const { t } = useTranslation()
  const section = useUi((s) => s.settings)
  const open = useUi((s) => s.openSettings)
  useBackLayer(section !== null, () => open(null))

  return (
    <Dialog open={section !== null} onOpenChange={(o) => !o && open(null)}>
      <DialogContent
        data-back-layer
        aria-describedby={undefined}
        className={cn(
          'top-[12%] flex h-[min(560px,76vh)] max-w-3xl p-0',
          // A phone: the whole screen, sections as a row of tabs above.
          'max-sm:inset-0 max-sm:h-full max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:flex-col max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2 max-sm:w-full max-sm:flex-row max-sm:overflow-x-auto max-sm:border-r-0 max-sm:border-b max-sm:pr-12 sm:w-60">
          <DialogTitle className="px-2.5 pt-1.5 pb-3 text-sm font-semibold max-sm:sr-only">
            {t('settings.title')}
          </DialogTitle>
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
              className={cn(
                'flex min-h-8 items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-[13.5px] leading-tight text-sidebar-foreground hover:bg-sidebar-accent max-sm:min-h-9 max-sm:shrink-0 max-sm:whitespace-nowrap',
                section === id && 'bg-sidebar-accent font-medium text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0 opacity-70" />
              {t(`settings.${id}`)}
            </button>
          ))}
        </nav>
        <div className="relative min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-3 right-3 max-sm:fixed max-sm:top-[calc(env(safe-area-inset-top)+0.625rem)] max-sm:right-2 max-sm:z-10 max-sm:size-9 max-sm:bg-sidebar"
            onClick={() => open(null)}
            aria-label={t('window.close')}
          >
            <X />
          </Button>
          <h2 className="mb-5 text-lg font-semibold">{section ? t(`settings.${section}`) : ''}</h2>
          {section === 'general' ? <GeneralSection /> : null}
          {section === 'account' ? <AccountSection /> : null}
          {section === 'plan' ? <PlanSection /> : null}
          {section === 'integrations' ? <IntegrationsSection /> : null}
          {section === 'ai' ? <AiSection /> : null}
          {section === 'data' ? <DataSection /> : null}
          {section === 'advanced' ? <AdvancedSection /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
