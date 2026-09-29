import {
  type AppleNotesFolder,
  type ImportFile,
  type ImportPlan,
  type ImportResult,
  planConverted,
  planImport,
  runImport,
} from '@fixnote/core'
import { i18n, useTranslation } from '@fixnote/i18n'
import { Button, Spinner } from '@fixnote/ui'
import { FileUp, FolderUp, StickyNote } from 'lucide-react'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { convertAppleNote, folderPath, isTrash } from '../../lib/apple-notes'
import { useDb } from '../../lib/db'
import { prepareImage } from '../../lib/images'
import { usePlatform } from '../../lib/platform'
import { useInvalidateNotes } from '../../lib/queries'

type State =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'ready'; plan: ImportPlan; files: ImportFile[] }
  | { phase: 'running'; done: number; total: number }
  | { phase: 'apple-opening' }
  | { phase: 'apple-denied' }
  | { phase: 'apple-pick'; folders: AppleNotesFolder[]; chosen: string[] }

/** Notes read from Apple Notes per call: small enough to show progress, few enough to be quick. */
const APPLE_BATCH = 20
const AUTOMATION_SETTINGS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'

async function readFiles(list: FileList): Promise<ImportFile[]> {
  return Promise.all(
    Array.from(list, async (f) => ({
      path: f.webkitRelativePath || f.name,
      data: new Uint8Array(await f.arrayBuffer()),
      modified: f.lastModified,
    })),
  )
}

/**
 * Brings notes in from Markdown folders, Bear, Notion, a FixNote export or (on a Mac) Apple Notes,
 * with Undo.
 */
export function ImportSection() {
  const { t } = useTranslation()
  const platform = usePlatform()
  const { repo, attachments } = useDb()
  const invalidate = useInvalidateNotes()
  const [state, setState] = useState<State>({ phase: 'idle' })
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list?.length) return
    setState({ phase: 'reading' })
    try {
      const files = await readFiles(list)
      setState({ phase: 'ready', plan: planImport(files), files })
    } catch (err) {
      setState({ phase: 'idle' })
      toast(t('data.importFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      e.target.value = ''
    }
  }

  const addImage = async (file: ImportFile, mime: string) => {
    const { blob, mime: stored } = await prepareImage(new Blob([file.data.slice()], { type: mime }))
    return (await attachments.add(blob, stored)).id
  }

  const report = (result: ImportResult, notes: string[] = []) => {
    const message = [
      t('data.imported', { count: result.noteIds.length }),
      result.duplicates ? t('data.duplicates', { count: result.duplicates }) : '',
      ...notes,
    ]
      .filter(Boolean)
      .join(' · ')
    // Undo goes through the repo: this dialog may be closed by the time it is pressed.
    toast(message, {
      duration: 10_000,
      ...(result.noteIds.length
        ? {
            action: {
              label: t('common.undo'),
              onClick: () =>
                void (async () => {
                  for (const id of result.noteIds) await repo.deleteNote(id)
                  for (const id of [...result.folderIds].reverse()) await repo.deleteFolder(id)
                  await invalidate()
                  toast(i18n.t('data.undone'))
                })(),
            },
          }
        : {}),
    })
  }

  const failed = (err: unknown) =>
    toast(t('data.importFailed', { error: err instanceof Error ? err.message : String(err) }))

  const start = async (plan: ImportPlan, files: ImportFile[]) => {
    setState({ phase: 'running', done: 0, total: plan.notes.length })
    try {
      const result = await runImport(plan, files, {
        repo,
        addImage,
        onProgress: (done, total) => setState({ phase: 'running', done, total }),
      })
      await invalidate()
      report(result)
    } catch (err) {
      failed(err)
    } finally {
      setState({ phase: 'idle' })
    }
  }

  const openApple = async () => {
    if (!platform.appleNotes) return
    setState({ phase: 'apple-opening' })
    try {
      const folders = await platform.appleNotes.folders()
      setState({
        phase: 'apple-pick',
        folders,
        chosen: folders.filter((f) => f.count && !isTrash(f)).map((f) => f.id),
      })
    } catch (err) {
      if (String(err).includes('denied')) setState({ phase: 'apple-denied' })
      else {
        setState({ phase: 'idle' })
        failed(err)
      }
    }
  }

  /** Reads the chosen folders in batches and imports each batch as it comes. */
  const startApple = async (all: AppleNotesFolder[], chosen: string[]) => {
    const source = platform.appleNotes
    if (!source) return
    const accounts = new Set(all.map((f) => f.account)).size
    const folders = all.filter((f) => chosen.includes(f.id))
    const total = folders.reduce((sum, f) => sum + f.count, 0)
    const result: ImportResult = { noteIds: [], folderIds: [], images: 0, duplicates: 0 }
    let done = 0
    let locked = 0
    let lost = 0
    setState({ phase: 'running', done, total })
    try {
      for (const folder of folders) {
        for (let from = 0; from < folder.count; from += APPLE_BATCH) {
          const notes = await source.read(folder.id, from, APPLE_BATCH)
          if (!notes.length) break
          const converted = []
          for (const note of notes) {
            if (note.locked) {
              locked++
              continue
            }
            const c = convertAppleNote(note, folderPath(folder, accounts))
            lost += c.lost
            converted.push(c)
          }
          const { plan, files } = planConverted('apple', converted)
          const part = await runImport(plan, files, { repo, addImage })
          result.noteIds.push(...part.noteIds)
          result.folderIds.push(...part.folderIds)
          result.images += part.images
          result.duplicates += part.duplicates
          done += notes.length
          setState({ phase: 'running', done: Math.min(done, total), total })
        }
      }
    } catch (err) {
      failed(err)
      if (!result.noteIds.length) return
    } finally {
      setState({ phase: 'idle' })
    }
    // What came in before a failure stays, with its Undo.
    await invalidate()
    report(result, [
      locked ? t('data.apple.locked', { count: locked }) : '',
      lost ? t('data.apple.lost', { count: lost }) : '',
    ])
  }

  const busy = state.phase !== 'idle' && state.phase !== 'ready'

  return (
    <div className="space-y-3">
      <h3 className="font-medium">{t('data.import')}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{t('data.importBody')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => filesInput.current?.click()}>
          <FileUp />
          {t('data.chooseFiles')}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => folderInput.current?.click()}>
          <FolderUp />
          {t('data.chooseFolder')}
        </Button>
        {platform.appleNotes ? (
          <Button
            variant="outline"
            disabled={busy}
            loading={state.phase === 'apple-opening'}
            onClick={() => void openApple()}
          >
            <StickyNote />
            {t('data.apple.button')}
          </Button>
        ) : null}
      </div>
      {state.phase === 'apple-opening' ? (
        <p className="max-w-md text-sm text-muted-foreground" role="status">
          {t('data.apple.opening')}
        </p>
      ) : null}
      {state.phase === 'apple-denied' ? (
        <div className="max-w-md space-y-3 rounded-lg border bg-card p-3 text-sm">
          <p>{t('data.apple.denied')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void platform.openExternal(AUTOMATION_SETTINGS)}
            >
              {t('data.apple.openSettings')}
            </Button>
            <Button size="sm" onClick={() => void openApple()}>
              {t('data.apple.retry')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState({ phase: 'idle' })}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      {state.phase === 'apple-pick' ? (
        <ApplePicker
          folders={state.folders}
          chosen={state.chosen}
          onChange={(chosen) => setState({ ...state, chosen })}
          onStart={() => void startApple(state.folders, state.chosen)}
          onCancel={() => setState({ phase: 'idle' })}
        />
      ) : null}
      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        accept=".zip,.bear2bk,.md,.markdown,.txt"
        data-testid="import-files"
        onChange={pick}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        data-testid="import-folder"
        onChange={pick}
        {...{ webkitdirectory: '' }}
      />
      {state.phase === 'reading' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner />
          {t('data.reading')}
        </p>
      ) : null}
      {state.phase === 'running' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner />
          {t('data.importing', { done: state.done, total: state.total })}
        </p>
      ) : null}
      {state.phase === 'ready' ? (
        <div className="max-w-md space-y-3 rounded-lg border bg-card p-3 text-sm">
          {state.plan.notes.length ? (
            <>
              <p className="font-medium">{t(`data.source.${state.plan.source}`)}</p>
              <p className="text-muted-foreground">
                {t('data.found', {
                  notes: state.plan.notes.length,
                  folders: state.plan.folders,
                  images: state.plan.images,
                })}
              </p>
              {state.plan.skipped.length ? (
                <p className="text-muted-foreground">
                  {t('data.skipped', { count: state.plan.skipped.length })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">{t('data.nothingFound')}</p>
          )}
          <div className="flex gap-2">
            {state.plan.notes.length ? (
              <Button size="sm" onClick={() => void start(state.plan, state.files)}>
                {t('data.start')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setState({ phase: 'idle' })}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The folders of Apple Notes to pick from, grouped by account when there are several. */
function ApplePicker({
  folders,
  chosen,
  onChange,
  onStart,
  onCancel,
}: {
  folders: AppleNotesFolder[]
  chosen: string[]
  onChange: (chosen: string[]) => void
  onStart: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const accounts = [...new Set(folders.map((f) => f.account))]
  const count = folders.filter((f) => chosen.includes(f.id)).reduce((sum, f) => sum + f.count, 0)
  const box = useRef<HTMLDivElement>(null)
  // It opens below the buttons, at the bottom of the settings: bring it into view.
  useEffect(() => box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), [])
  return (
    <div ref={box} className="max-w-md space-y-3 rounded-lg border bg-card p-3 text-sm">
      <p className="font-medium">{t('data.source.apple')}</p>
      {folders.some((f) => f.count) ? (
        <>
          <p className="text-muted-foreground">{t('data.apple.pick')}</p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {accounts.map((account) => (
              <div key={account}>
                {accounts.length > 1 ? (
                  <p className="px-2 pb-0.5 text-xs font-medium text-muted-foreground">{account}</p>
                ) : null}
                <ul className="space-y-0.5">
                  {folders
                    .filter((f) => f.account === account)
                    .map((f) => (
                      <li key={f.id}>
                        <label
                          className="flex items-center gap-2 rounded-md py-1 pr-2 text-sm hover:bg-accent"
                          style={{ paddingLeft: `${8 + (f.path.length - 1) * 18}px` }}
                        >
                          <input
                            type="checkbox"
                            className="size-4 accent-brand"
                            disabled={!f.count}
                            checked={chosen.includes(f.id)}
                            onChange={(e) =>
                              onChange(
                                e.target.checked
                                  ? [...chosen, f.id]
                                  : chosen.filter((id) => id !== f.id),
                              )
                            }
                          />
                          <span className="truncate">{f.path.at(-1)}</span>
                          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                            {f.count}
                          </span>
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground">{t('data.apple.chosen', { count })}</p>
        </>
      ) : (
        <p className="text-muted-foreground">{t('data.apple.empty')}</p>
      )}
      <div className="flex gap-2">
        {count ? (
          <Button size="sm" onClick={onStart}>
            {t('data.start')}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
