import type { WindowControls as Controls } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import { useEffect, useState } from 'react'

/** Windows 11-style caption buttons for the frameless desktop window. */
export function WindowControls({ controls }: { controls: Controls }) {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let alive = true
    const sync = () => void controls.isMaximized().then((m) => alive && setMaximized(m))
    sync()
    void controls.onResized(sync).then((u) => {
      if (alive) unlisten = u
      else u()
    })
    return () => {
      alive = false
      unlisten?.()
    }
  }, [controls])

  const btn =
    'flex h-full w-[46px] items-center justify-center text-foreground/80 transition-colors hover:bg-foreground/8 active:bg-foreground/12'

  return (
    <div className="flex h-full shrink-0 items-stretch">
      <button
        type="button"
        className={btn}
        onClick={() => void controls.minimize()}
        aria-label={t('window.minimize')}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 5.5h10" stroke="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => void controls.toggleMaximize()}
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2.5 2.5V.5h7v7h-2" stroke="currentColor" />
            <rect x=".5" y="2.5" width="7" height="7" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x=".5" y=".5" width="9" height="9" stroke="currentColor" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className={cn(btn, 'hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/85')}
        onClick={() => void controls.close()}
        aria-label={t('window.close')}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" />
        </svg>
      </button>
    </div>
  )
}
