import { useTranslation } from '@fixnote/i18n'
import { Button } from '@fixnote/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2, Link2Off } from 'lucide-react'
import { toast } from 'sonner'
import { useUi } from '../../app/store'
import { useRepo } from '../../lib/db'
import { revokeShare } from '../../lib/share'
import { SHARES_KEY, useShares } from '../ShareDialog'

/** Every open link of the account, including links to notes deleted since. */
export function SharedLinksSection() {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const shares = useShares()
  const list = shares.data ?? []
  const titles = useQuery({
    queryKey: [...SHARES_KEY, 'titles', list.map((s) => s.noteId).join()],
    queryFn: async () =>
      new Map(
        await Promise.all(
          list.map(async (s) => [s.noteId, (await repo.getNote(s.noteId))?.title ?? null] as const),
        ),
      ),
    enabled: list.length > 0,
  })
  if (!list.length) return null

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="font-medium">{t('share.links')}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{t('share.linksBody')}</p>
      </div>
      <ul className="max-w-md space-y-1">
        {list.map((share) => {
          const title = titles.data?.get(share.noteId)
          const exists = title !== null && title !== undefined
          return (
            <li key={share.id} className="flex items-center gap-2 text-sm">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              {exists ? (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() => {
                    useUi.getState().openSettings(null)
                    useUi.getState().navigate({ kind: 'note', id: share.noteId })
                  }}
                >
                  {title || t('common.untitled')}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {titles.isPending ? '' : t('share.deletedNote')}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('share.copy')}
                onClick={async () => {
                  await navigator.clipboard.writeText(share.url)
                  toast(t('share.copied'))
                }}
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('share.stop')}
                onClick={async () => {
                  try {
                    await revokeShare(share.id)
                    await qc.invalidateQueries({ queryKey: SHARES_KEY })
                    toast(t('share.stopped'))
                  } catch (err) {
                    toast(
                      t('share.failed', {
                        error: err instanceof Error ? err.message : String(err),
                      }),
                    )
                  }
                }}
              >
                <Link2Off />
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
