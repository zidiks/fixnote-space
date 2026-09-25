import { type ImportFile, type ImportPlan, planImport, runImport } from '@fixnote/core'
import { i18n, useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { FileUp, FolderUp } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useDb } from '../../lib/db'
import { prepareImage } from '../../lib/images'
import { useInvalidateNotes } from '../../lib/queries'

type State =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'ready'; plan: ImportPlan; files: ImportFile[] }
  | { phase: 'running'; done: number; total: number }

async function readFiles(list: FileList): Promise<ImportFile[]> {
  return Promise.all(
    Array.from(list, async (f) => ({
      path: f.webkitRelativePath || f.name,
      data: new Uint8Array(await f.arrayBuffer()),
      modified: f.lastModified,
    })),
  )
}

/** Brings notes in from Markdown folders, Bear, Notion or a FixNote export, with Undo. */
export function ImportSection() {
  const { t } = useTranslation()
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

  const start = async (plan: ImportPlan, files: ImportFile[]) => {
    setState({ phase: 'running', done: 0, total: plan.notes.length })
    try {
      const result = await runImport(plan, files, {
        repo,
        addImage: async (file, mime) => {
          const { blob, mime: stored } = await prepareImage(
            new Blob([file.data.slice()], { type: mime }),
          )
          return (await attachments.add(blob, stored)).id
        },
        onProgress: (done, total) => setState({ phase: 'running', done, total }),
      })
      await invalidate()
      const message = [
        t('data.imported', { count: result.noteIds.length }),
        result.duplicates ? t('data.duplicates', { count: result.duplicates }) : '',
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
    } catch (err) {
      toast(t('data.importFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setState({ phase: 'idle' })
    }
  }

  const busy = state.phase === 'reading' || state.phase === 'running'

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
      </div>
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
        <p className="text-sm text-muted-foreground">{t('data.reading')}</p>
      ) : null}
      {state.phase === 'running' ? (
        <p className="text-sm text-muted-foreground" role="status">
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
