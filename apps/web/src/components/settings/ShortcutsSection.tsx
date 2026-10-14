import { useTranslation } from '@fixnote/i18n'
import { Button, cn, isApple } from '@fixnote/ui'
import { RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  APP_ACTIONS,
  type Binding,
  type BindingProblem,
  bindingFromEvent,
  bindingLabel,
  bindingProblem,
  GLOBAL_ACTIONS,
  type GlobalAction,
  isGlobal,
  type ShortcutAction,
} from '../../lib/hotkeys'
import { usePlatform } from '../../lib/platform'
import {
  bindingsOf,
  DEFAULTS,
  resetAllShortcuts,
  resetBinding,
  setBinding,
  setGlobalOn,
  useShortcuts,
} from '../../lib/shortcuts'

/**
 * Settings → Shortcuts: every shortcut with its keys; click to record new ones (Esc cancels),
 * reset one or all. System-wide ones (desktop only) can be switched off one by one, and show
 * when another app holds their keys.
 */
export function ShortcutsSection() {
  const { t } = useTranslation()
  const desktop = usePlatform().kind === 'desktop'
  const custom = useShortcuts((s) => s.custom)
  const off = useShortcuts((s) => s.off)
  const failed = useShortcuts((s) => s.failed)
  const bindings = useMemo(() => bindingsOf({ custom }), [custom])
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [problem, setProblem] = useState<{ action: ShortcutAction; why: BindingProblem } | null>(
    null,
  )

  const name = (action: ShortcutAction) =>
    isGlobal(action)
      ? `${t('shortcuts.global')}: ${t(`shortcuts.actions.${action}`)}`
      : t(`shortcuts.actions.${action}`)

  const explain = (p: BindingProblem, action: ShortcutAction) => {
    if (p.kind === 'taken') return t('shortcuts.taken', { action: name(p.by) })
    if (p.kind === 'reserved') return t('shortcuts.reserved')
    if (isGlobal(action)) {
      const example = DEFAULTS['global.newNote']
      return t('shortcuts.modifierGlobal', {
        example: example ? bindingLabel(example, isApple) : '',
      })
    }
    return t('shortcuts.modifierApp', { mod: isApple ? '⌘' : 'Ctrl' })
  }

  // While recording, keys go here only: no other shortcut runs, and Escape cancels instead of
  // closing the dialog. The system-wide ones are let go meanwhile (DesktopTray), or the OS
  // would take their keys before the window sees them.
  useEffect(() => {
    useShortcuts.setState({ recording: recording !== null })
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.code === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setRecording(null)
        setProblem(null)
        return
      }
      const b = bindingFromEvent(e, isApple)
      if (!b) return // a modifier on its own: wait for the key
      const p = bindingProblem(recording, b, { apple: isApple, desktop, bindings, off })
      if (p) {
        setProblem({ action: recording, why: p })
        return
      }
      setBinding(recording, b)
      setProblem(null)
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, desktop, bindings, off])

  useEffect(() => () => useShortcuts.setState({ recording: false }), [])

  const row = (action: ShortcutAction) => {
    const b = bindings[action]
    const global = isGlobal(action)
    const isOff = global && off[action as GlobalAction]
    const error =
      problem?.action === action
        ? explain(problem.why, action)
        : global && !isOff && failed[action as GlobalAction]
          ? t('shortcuts.failed')
          : null
    const label = t(`shortcuts.actions.${action}`)
    return (
      <li key={action} className="py-1.5">
        <div className="flex items-center gap-3">
          {global ? (
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-brand"
              checked={!isOff}
              aria-label={t('shortcuts.use', { action: label })}
              onChange={(e) => setGlobalOn(action as GlobalAction, e.target.checked)}
            />
          ) : null}
          <span className={cn('min-w-0 flex-1 text-sm', isOff && 'text-muted-foreground')}>
            {label}
          </span>
          <KeysButton
            binding={b}
            recording={recording === action}
            disabled={Boolean(isOff)}
            label={t('shortcuts.change', { action: label })}
            onClick={() => {
              setProblem(null)
              setRecording(recording === action ? null : action)
            }}
            onBlur={() => {
              if (recording === action) {
                setRecording(null)
                setProblem(null)
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={!(action in custom)}
            aria-label={t('shortcuts.reset')}
            title={t('shortcuts.reset')}
            onClick={() => {
              resetBinding(action)
              setProblem(null)
            }}
          >
            <RotateCcw />
          </Button>
        </div>
        {recording === action && !error ? (
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {t('shortcuts.recordHint')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1 text-right text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </li>
    )
  }

  return (
    <div className="max-w-xl space-y-6">
      <section className="space-y-2">
        <h3 className="font-medium">{t('shortcuts.inApp')}</h3>
        <p className="text-sm text-muted-foreground">{t('shortcuts.inAppBody')}</p>
        <ul className="divide-y">{APP_ACTIONS.map(row)}</ul>
      </section>
      <section className="space-y-2 border-t pt-5">
        <h3 className="font-medium">{t('shortcuts.global')}</h3>
        {desktop ? (
          <>
            <p className="text-sm text-muted-foreground">{t('shortcuts.globalBody')}</p>
            <ul className="divide-y">{GLOBAL_ACTIONS.map(row)}</ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('shortcuts.webOnly')}</p>
        )}
      </section>
      <Button
        variant="outline"
        size="sm"
        disabled={Object.keys(custom).length === 0 && Object.keys(off).length === 0}
        onClick={() => {
          resetAllShortcuts()
          setProblem(null)
        }}
      >
        <RotateCcw />
        {t('shortcuts.resetAll')}
      </Button>
    </div>
  )
}

function KeysButton({
  binding,
  recording,
  disabled,
  label,
  onClick,
  onBlur,
}: {
  binding: Binding | null
  recording: boolean
  disabled: boolean
  label: string
  onClick: () => void
  onBlur: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={recording}
      disabled={disabled}
      onClick={onClick}
      onBlur={onBlur}
      className={cn(
        'h-7 min-w-28 shrink-0 rounded-md border bg-muted px-2 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50',
        recording && 'border-brand bg-card text-foreground ring-2 ring-brand/30',
      )}
    >
      {recording
        ? t('shortcuts.recording')
        : binding
          ? bindingLabel(binding, isApple)
          : t('shortcuts.none')}
    </button>
  )
}
