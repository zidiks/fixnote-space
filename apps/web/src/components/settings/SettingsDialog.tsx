import { useTranslation } from '@fixnote/i18n'
import { Button, cn, Dialog, DialogContent, DialogTitle } from '@fixnote/ui'
import { Database, Settings2, Sparkles, UserRound, X } from 'lucide-react'
import { type SettingsSection, useUi } from '../../app/store'
import { AccountSection } from './AccountSection'
import { AiSection } from './AiSection'
import { DataSection } from './DataSection'
import { GeneralSection } from './GeneralSection'

const SECTIONS: { id: SettingsSection; icon: typeof Settings2 }[] = [
  { id: 'general', icon: Settings2 },
  { id: 'account', icon: UserRound },
  { id: 'ai', icon: Sparkles },
  { id: 'data', icon: Database },
]

export function SettingsDialog() {
  const { t } = useTranslation()
  const section = useUi((s) => s.settings)
  const open = useUi((s) => s.openSettings)

  return (
    <Dialog open={section !== null} onOpenChange={(o) => !o && open(null)}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12%] flex h-[min(560px,76vh)] max-w-3xl"
      >
        <nav className="flex w-60 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2">
          <DialogTitle className="px-2.5 pt-1.5 pb-3 text-sm font-semibold">
            {t('settings.title')}
          </DialogTitle>
          {SECTIONS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => open(id)}
              aria-current={section === id ? 'page' : undefined}
              className={cn(
                'flex min-h-8 items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-[13.5px] leading-tight text-sidebar-foreground hover:bg-sidebar-accent',
                section === id && 'bg-sidebar-accent font-medium text-foreground',
              )}
            >
              <Icon className="size-4 opacity-70" />
              {t(`settings.${id}`)}
            </button>
          ))}
        </nav>
        <div className="relative min-w-0 flex-1 overflow-y-auto p-6">
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-3 right-3"
            onClick={() => open(null)}
            aria-label={t('window.close')}
          >
            <X />
          </Button>
          <h2 className="mb-5 text-lg font-semibold">{section ? t(`settings.${section}`) : ''}</h2>
          {section === 'general' ? <GeneralSection /> : null}
          {section === 'account' ? <AccountSection /> : null}
          {section === 'ai' ? <AiSection /> : null}
          {section === 'data' ? <DataSection /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
