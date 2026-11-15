import { useTranslation } from '@fixnote/i18n'
import { cn } from '@fixnote/ui'
import { type Editor, useEditorState } from '@tiptap/react'
import { Bold, Code, Italic, Strikethrough } from 'lucide-react'
import { combo } from './combo'

/**
 * The formatting used most on selected text, next to "Ask AI" in the selection pill. The rest
 * (headings, lists, tasks) stays in the right-click menu.
 */
export function FormatBar({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
    }),
  })
  const chain = () => editor.chain().focus()
  const items = [
    {
      icon: Bold,
      label: t('menu.bold'),
      hint: combo('B'),
      on: active.bold,
      run: () => chain().toggleBold().run(),
    },
    {
      icon: Italic,
      label: t('menu.italic'),
      hint: combo('I'),
      on: active.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      icon: Strikethrough,
      label: t('menu.strike'),
      hint: combo('S', { shift: true }),
      on: active.strike,
      run: () => chain().toggleStrike().run(),
    },
    {
      icon: Code,
      label: t('menu.code'),
      hint: combo('E'),
      on: active.code,
      run: () => chain().toggleCode().run(),
    },
  ]
  return (
    <>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          aria-label={it.label}
          aria-pressed={it.on}
          title={`${it.label} (${it.hint})`}
          // Keep the editor selection: a mousedown here would otherwise blur it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={it.run}
          className={cn(
            'flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:size-9 [&_svg]:size-3.5',
            it.on && 'bg-accent text-brand hover:text-brand',
          )}
        >
          <it.icon />
        </button>
      ))}
    </>
  )
}
