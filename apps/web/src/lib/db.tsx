import {
  Attachments,
  LinkPreviews,
  NotesRepo,
  prepareDatabase,
  type SqlDriver,
} from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { conflictHeading } from './conflict'
import { platform } from './platform'

interface DbContextValue {
  repo: NotesRepo
  driver: SqlDriver
  links: LinkPreviews
  attachments: Attachments
  storage: SqlDriver['storage']
}

const DbContext = createContext<DbContextValue | null>(null)

let opening: Promise<DbContextValue> | null = null

function openDb(): Promise<DbContextValue> {
  opening ??= (async () => {
    const driver = await platform.sql()
    await prepareDatabase(driver)
    return {
      repo: new NotesRepo(driver, { conflictHeading }),
      driver,
      links: new LinkPreviews(driver),
      attachments: new Attachments(driver, platform.blobs),
      storage: driver.storage,
    }
  })()
  opening.catch(() => {
    opening = null
  })
  return opening
}

/** Opens the local database once and runs migrations before rendering the app. */
export function DbProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [value, setValue] = useState<DbContextValue | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(() => {
    setError(null)
    openDb().then(setValue, (err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  useEffect(start, [start])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">{t('storage.failed')}</p>
        <p className="max-w-md font-mono text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={start}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }
  if (!value) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    )
  }
  return <DbContext.Provider value={value}>{children}</DbContext.Provider>
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext)
  if (!ctx) throw new Error('useDb must be used inside <DbProvider>')
  return ctx
}

export const useRepo = () => useDb().repo
