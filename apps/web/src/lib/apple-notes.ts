import type { AppleNote, AppleNotesFolder, ConvertedNote } from '@fixnote/core'
import { DOMParser as SchemaParser } from '@tiptap/pm/model'
import { schemaEditor } from '../components/editor/headless'

/** Apple Notes' own trash; its notes are not offered by default. */
const TRASH = /recently deleted|недавно удал|eliminad|borrad/i

export const isTrash = (folder: AppleNotesFolder) => TRASH.test(folder.path.at(-1) ?? '')

/**
 * Where a folder's notes go: the default folder ("Notes") has no folder in FixNote, the rest keep
 * their path; with several accounts (iCloud, On My Mac, Gmail) each account is a folder too.
 */
export function folderPath(folder: AppleNotesFolder, accounts: number): string[] {
  const path = folder.home ? [] : folder.path
  return accounts > 1 ? [folder.account, ...path] : path
}

const BLOCK = new Set([
  'DIV',
  'P',
  'UL',
  'OL',
  'TABLE',
  'H1',
  'H2',
  'H3',
  'PRE',
  'BLOCKQUOTE',
  'HR',
])

const rename = (el: Element, tag: string) => {
  const next = el.ownerDocument.createElement(tag)
  next.append(...el.childNodes)
  el.replaceWith(next)
  return next
}
const unwrap = (el: Element) => el.replaceWith(...el.childNodes)

/** A line typed in "Monostyled": a div holding just `<tt>`. */
const monoLine = (el: Element) =>
  el.tagName === 'DIV' &&
  el.children.length === 1 &&
  el.firstElementChild?.tagName === 'TT' &&
  el.textContent === el.firstElementChild.textContent

function decode(src: string): { data: Uint8Array; mime: string } | null {
  const m = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
  if (!m?.[1]?.startsWith('image/') || !m[3]) return null
  try {
    const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3])
    return { data: Uint8Array.from(raw, (c) => c.charCodeAt(0)), mime: m[1] }
  } catch {
    return null
  }
}

/**
 * The HTML the Notes app gives (a `<div>` per line, images as data URIs) as FixNote Markdown, with
 * the images as `![](img:<key>)` for `planConverted`. Attachments that are not inline images
 * (PDFs, scans, drawings) are not in the HTML; `lost` counts them.
 */
export function convertAppleNote(
  note: AppleNote,
  folder: string[],
): ConvertedNote & { lost: number } {
  const doc = new DOMParser().parseFromString(note.html, 'text/html')
  const body = doc.body
  const images: ConvertedNote['images'] = []

  for (const el of body.querySelectorAll('script, style, object, embed, iframe')) el.remove()
  for (const img of body.querySelectorAll('img')) {
    const file = decode(img.getAttribute('src') ?? '')
    if (!file) {
      img.remove()
      continue
    }
    const key = `i${images.length}`
    images.push({ key, ...file })
    img.setAttribute('src', `img:${key}`)
  }

  // Consecutive monostyled lines are one code block.
  for (const el of [...body.querySelectorAll('div')]) {
    if (
      !el.isConnected ||
      !monoLine(el) ||
      (el.previousElementSibling && monoLine(el.previousElementSibling))
    )
      continue
    const lines: string[] = []
    let line: Element | null = el
    while (line && monoLine(line)) {
      lines.push(line.textContent ?? '')
      const next: Element | null = line.nextElementSibling
      if (line !== el) line.remove()
      line = next
    }
    const pre = doc.createElement('pre')
    const code = doc.createElement('code')
    code.textContent = lines.join('\n')
    pre.append(code)
    el.replaceWith(pre)
  }
  for (const tt of [...body.querySelectorAll('tt')]) rename(tt, 'code')
  // Markdown has no underline; the text stays.
  for (const u of [...body.querySelectorAll('u')]) unwrap(u)
  for (const h of [...body.querySelectorAll('h4, h5, h6')]) rename(h, 'h3')
  // Markdown tables start with a header; Apple's have none, so the first row is it.
  for (const table of body.querySelectorAll('table')) {
    const first = table.querySelector('tr')
    for (const td of [...(first?.querySelectorAll(':scope > td') ?? [])]) rename(td, 'th')
  }

  // A div is a line: a paragraph, or nothing when it only makes a blank line. Innermost first.
  for (const div of [...body.querySelectorAll('div')].reverse()) {
    if ([...div.children].some((c) => BLOCK.has(c.tagName))) {
      unwrap(div)
      continue
    }
    if (!div.textContent?.trim()) {
      // A line with just an image is the image (a block), not a paragraph around it.
      if (div.querySelector('img')) unwrap(div)
      else div.remove()
      continue
    }
    while (div.lastChild?.nodeName === 'BR') div.lastChild.remove()
    rename(div, 'p')
  }

  // The first line styled as a title (bold or large) is the note's title.
  const first = body.firstElementChild
  if (first?.tagName === 'P' && first.textContent?.trim() === note.title.trim()) {
    const bold = first.querySelector('b, strong')?.textContent === first.textContent
    const size = Number.parseFloat(
      first.querySelector<HTMLElement>('[style*="font-size"]')?.style.fontSize ?? '',
    )
    if (bold || size >= 18) {
      const h1 = doc.createElement('h1')
      h1.textContent = first.textContent
      first.replaceWith(h1)
    }
  }

  const editor = schemaEditor()
  const json = SchemaParser.fromSchema(editor.schema).parse(body).toJSON()
  const markdown = editor.markdown?.serialize(json) ?? body.textContent ?? ''
  return {
    folder,
    markdown,
    ...(note.created ? { created: note.created } : {}),
    ...(note.modified ? { updated: note.modified } : {}),
    images,
    lost: Math.max(0, note.files - images.length),
  }
}
