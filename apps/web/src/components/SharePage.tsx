import { type SharedNote, sharedFileBytes } from '@fixnote/core'
import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Link2Off, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { openSharedLink } from '../lib/shared-link'
import { AttachmentImage } from './editor/attachment-image'
import { ImageAwareParagraph } from './editor/paragraph'

type State = 'loading' | 'gone' | 'broken' | 'failed' | SharedNote

/** Search engines stay away, and outgoing links and images get no referrer. */
function addMeta(name: string, content: string) {
  if (document.head.querySelector(`meta[name="${name}"]`)) return
  const meta = document.createElement('meta')
  meta.name = name
  meta.content = content
  document.head.append(meta)
}

/**
 * The public page behind a shared link. It needs no account and no local database: it fetches the
 * sealed copy, opens it with the key from the #fragment and shows it read-only.
 */
export function SharePage({ id, linkKey }: { id: string; linkKey: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>('loading')

  const load = useCallback(() => {
    setState('loading')
    openSharedLink(id, linkKey).then(setState, () => setState('failed'))
  }, [id, linkKey])

  useEffect(() => {
    addMeta('robots', 'noindex, nofollow')
    addMeta('referrer', 'no-referrer')
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', dark.matches)
    apply()
    dark.addEventListener('change', apply)
    load()
    return () => dark.removeEventListener('change', apply)
  }, [load])

  const note = typeof state === 'object' ? state : null
  useEffect(() => {
    document.title = note ? `${note.title || t('common.untitled')} · FixNote` : 'FixNote'
  }, [note, t])

  return (
    <div className="min-h-full bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl px-6 pt-8 pb-24 sm:px-10">
        <header className="mb-8 flex items-center justify-between text-[13px] text-muted-foreground">
          <a href="/" className="font-semibold text-foreground">
            FixNote
          </a>
          {note ? (
            <span>
              {t('share.page.shared', {
                date: new Date(note.sharedAt).toLocaleDateString(undefined, {
                  dateStyle: 'long',
                }),
              })}
            </span>
          ) : null}
        </header>
        {state === 'loading' ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : state === 'gone' || state === 'broken' ? (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <Link2Off className="size-6 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{t(`share.page.${state}`)}</h1>
            <p className="max-w-sm text-sm text-muted-foreground">{t(`share.page.${state}Body`)}</p>
          </div>
        ) : state === 'failed' ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <TriangleAlert className="size-6 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">{t('share.page.failed')}</p>
            <Button variant="outline" size="sm" onClick={load}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <>
            <SharedContent note={state} />
            {state.omitted ? (
              <p className="mt-6 text-sm text-muted-foreground">
                {t('share.page.omitted', { count: state.omitted })}
              </p>
            ) : null}
            <footer className="mt-16 border-t pt-4 text-xs text-muted-foreground">
              {t('share.page.footer')}
            </footer>
          </>
        )}
      </main>
    </div>
  )
}

function SharedContent({ note }: { note: SharedNote }) {
  // One note per page load: the object URLs live as long as the page.
  const files = useMemo(
    () =>
      new Map(
        Object.entries(note.files).map(([fileId, f]) => [
          fileId,
          {
            url: URL.createObjectURL(new Blob([sharedFileBytes(f).slice()], { type: f.mime })),
            mime: f.mime,
          },
        ]),
      ),
    [note],
  )

  const editor = useEditor(
    {
      editable: false,
      extensions: [
        StarterKit.configure({
          paragraph: false,
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: true,
            autolink: false,
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
          },
        }),
        ImageAwareParagraph,
        TaskList,
        TaskItem.configure({ nested: true }),
        Markdown,
        AttachmentImage.configure({ resolve: async (fileId) => files.get(fileId) ?? null }),
      ],
      content: note.content,
      contentType: 'markdown',
      editorProps: { attributes: { class: 'fixnote-editor', 'aria-readonly': 'true' } },
    },
    [note, files],
  )
  return <EditorContent editor={editor} />
}
