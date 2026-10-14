import { useTranslation } from '@fixnote/i18n'
import { Button, cn, Dialog, DialogContent, DialogDescription, DialogTitle } from '@fixnote/ui'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { type Layout, useUi } from '../app/store'
import { useAccount } from '../lib/account/account'
import { useBackLayer } from '../lib/nav-history'

const LAYOUTS: Layout[] = ['assistant', 'notes']

/** A line of text in a preview. */
function Bar({ className }: { className?: string }) {
  return <span className={cn('block h-[3px] rounded-full bg-muted-foreground/25', className)} />
}

/** The sidebar of a preview: search, a few places, the current one highlighted. */
function MiniSidebar() {
  return (
    <span className="flex w-[22%] shrink-0 flex-col gap-[5px] border-r border-sidebar-border bg-sidebar p-[6px]">
      <span className="mb-[2px] block h-[7px] rounded-[2px] border border-sidebar-border bg-background/70" />
      <span className="flex h-[7px] items-center rounded-[2px] bg-sidebar-accent px-[3px]">
        <Bar className="w-3/4 bg-foreground/35" />
      </span>
      <Bar className="ml-[3px] w-2/3" />
      <Bar className="ml-[3px] w-1/2" />
      <Bar className="ml-[3px] mt-[3px] w-3/5" />
      <Bar className="ml-[3px] w-2/5" />
    </span>
  )
}

/**
 * A small picture of each layout, drawn with the app's own colors, so it matches the theme:
 * the assistant layout with its greeting and large cards, the notes layout with three columns.
 */
export function LayoutPreview({ layout, className }: { layout: Layout; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex aspect-[16/10] w-full flex-col overflow-hidden rounded-lg border bg-background shadow-xs',
        className,
      )}
    >
      <span className="flex h-[9px] shrink-0 items-center gap-[3px] border-b px-[5px]">
        <span className="size-[3px] rounded-full bg-muted-foreground/30" />
        <span className="size-[3px] rounded-full bg-muted-foreground/30" />
        <span className="size-[3px] rounded-full bg-muted-foreground/30" />
      </span>
      <span className="flex min-h-0 flex-1">
        <MiniSidebar />
        {layout === 'assistant' ? (
          <span className="flex min-w-0 flex-1 flex-col items-center px-[8%] pt-[7%]">
            <span className="size-[14px] rounded-full bg-gradient-to-br from-brand/80 to-brand/40" />
            <Bar className="mt-[6px] h-[4px] w-2/5 bg-foreground/40" />
            <span className="mt-[5px] flex gap-[3px]">
              <span className="h-[6px] w-[18px] rounded-full bg-brand/80" />
              <span className="h-[6px] w-[14px] rounded-full border bg-card" />
              <span className="h-[6px] w-[14px] rounded-full border bg-card" />
            </span>
            <span className="mt-[9%] grid w-full grid-cols-3 gap-[4px]">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="flex h-[26px] flex-col gap-[3px] rounded-[3px] border bg-card p-[3px]"
                >
                  <Bar className="w-3/4 bg-foreground/35" />
                  <Bar className="w-full" />
                  <Bar className="w-2/3" />
                </span>
              ))}
            </span>
          </span>
        ) : (
          <>
            <span className="flex w-[30%] shrink-0 flex-col gap-[2px] border-r p-[4px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'flex flex-col gap-[3px] rounded-[3px] px-[4px] py-[4px]',
                    i === 1 && 'bg-accent',
                  )}
                >
                  <Bar className="w-3/4 bg-foreground/35" />
                  <Bar className="w-full" />
                </span>
              ))}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[4px] px-[9%] pt-[8%]">
              <Bar className="mb-[3px] h-[5px] w-1/2 bg-foreground/40" />
              <Bar className="w-full" />
              <Bar className="w-11/12" />
              <Bar className="w-4/5" />
              <Bar className="mt-[4px] w-full" />
              <Bar className="w-2/3" />
            </span>
          </>
        )}
      </span>
    </span>
  )
}

/** The two layouts side by side, each with its picture and one line; one is checked. */
export function LayoutPicker({
  value,
  onChange,
  className,
}: {
  value: Layout
  onChange: (layout: Layout) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      role="radiogroup"
      aria-label={t('layout.setting')}
      className={cn('grid grid-cols-2 gap-3', className)}
    >
      {LAYOUTS.map((l) => {
        const on = l === value
        return (
          // biome-ignore lint/a11y/useSemanticElements: a card with a picture, not a bare radio input.
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(l)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
              e.preventDefault()
              const next = LAYOUTS[(LAYOUTS.indexOf(l) + 1) % LAYOUTS.length] ?? l
              onChange(next)
              const sibling =
                e.key === 'ArrowRight'
                  ? e.currentTarget.nextElementSibling
                  : e.currentTarget.previousElementSibling
              if (sibling instanceof HTMLElement) sibling.focus()
            }}
            tabIndex={on ? 0 : -1}
            className={cn(
              'flex min-w-0 flex-col gap-2.5 rounded-xl border bg-card p-2.5 text-left transition-[border-color,box-shadow] outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/40 sm:p-3',
              on && 'border-brand ring-2 ring-brand/30 hover:border-brand',
            )}
          >
            <LayoutPreview layout={l} />
            <span className="flex items-start gap-2 px-0.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(`layout.${l}`)}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {t(`layout.${l}Body`)}
                </span>
              </span>
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  on ? 'border-brand bg-brand text-brand-foreground' : 'border-muted-foreground/40',
                )}
              >
                {on ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The question is on screen: other offers that open by themselves wait (`Paywall`). */
export const useLayoutAsking = create<{ open: boolean }>()(() => ({ open: false }))

/** How long the app has to be settled, with nothing else open, before the question appears. */
const SETTLE_MS = 1200

/** Anything else that asks for attention: a dialog, a menu, search, settings, the sign-in. */
function somethingOpen(): boolean {
  const ui = useUi.getState()
  if (ui.settings !== null || ui.spotlightOpen) return true
  if (useAccount.getState().phase === 'loading') return true
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null
}

/**
 * "How do you want to work?": once per device, for everyone who has not picked a layout yet (new
 * installs and people who used the app before there was a choice). It waits until the app has
 * loaded and nothing else is on screen (sign-in, the recovery phrase, the Pro offer), starts on
 * the layout in use, and closing it keeps that layout and counts as the choice. Settings →
 * General changes it later.
 */
export function LayoutOnboarding() {
  const { t } = useTranslation()
  const layout = useUi((s) => s.layout)
  const setLayout = useUi((s) => s.setLayout)
  const open = useLayoutAsking((s) => s.open)
  const [choice, setChoice] = useState<Layout>('assistant')

  useEffect(() => {
    if (layout !== null || open) return
    let quietSince: number | null = null
    const timer = setInterval(() => {
      if (somethingOpen() || document.visibilityState !== 'visible') {
        quietSince = null
        return
      }
      quietSince ??= Date.now()
      if (Date.now() - quietSince >= SETTLE_MS) useLayoutAsking.setState({ open: true })
    }, 400)
    return () => clearInterval(timer)
  }, [layout, open])

  const close = (picked: Layout) => {
    setLayout(picked)
    useLayoutAsking.setState({ open: false })
  }
  // Back on a phone, Escape, or a click outside: the layout in use stays, and is the choice.
  const shown = open && layout === null
  useBackLayer(shown, () => close('assistant'))

  return (
    <Dialog open={shown} onOpenChange={(o) => !o && close('assistant')}>
      <DialogContent
        data-back-layer
        className="top-[10%] max-w-2xl p-5 sm:p-7"
        onOpenAutoFocus={(e) => {
          // Focus the checked layout, not the first button in the dialog.
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)
            ?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
            ?.focus()
        }}
      >
        <div className="space-y-1.5">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {t('layout.title')}
          </DialogTitle>
          <DialogDescription className="text-sm">{t('layout.body')}</DialogDescription>
        </div>
        <LayoutPicker value={choice} onChange={setChoice} className="mt-5" />
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="brand" className="rounded-full px-5" onClick={() => close(choice)}>
            {t('layout.continue')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
