import { useTranslation } from '@fixnote/i18n'
import { Dialog, DialogContent, DialogTitle } from '@fixnote/ui'
import { PeopleSection } from './PeopleSection'

/** Who a folder is shared with (all of its notes, subfolders included). */
export function FolderShareDialog({
  folder,
  onOpenChange,
}: {
  folder: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={folder !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg space-y-4 overflow-y-auto p-6">
        <DialogTitle className="font-semibold">
          {t('people.folderTitle', { name: folder?.name ?? '' })}
        </DialogTitle>
        {folder ? (
          <PeopleSection
            target={{ kind: 'folder', folderId: folder.id }}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
