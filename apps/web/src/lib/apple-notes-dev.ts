import type { AppleNote, AppleNotesFolder, AppleNotesSource } from '@fixnote/core'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg=='
const day = (d: number) => Date.UTC(2025, 0, d)

const FOLDERS: AppleNotesFolder[] = [
  { id: 'f-notes', path: ['Notes'], account: 'iCloud', count: 2, home: true },
  { id: 'f-work', path: ['Work'], account: 'iCloud', count: 2, home: false },
  { id: 'f-q3', path: ['Work', 'Q3'], account: 'iCloud', count: 1, home: false },
  { id: 'f-empty', path: ['Empty'], account: 'iCloud', count: 0, home: false },
  { id: 'f-trash', path: ['Recently Deleted'], account: 'iCloud', count: 1, home: false },
]

const note = (
  id: string,
  title: string,
  html: string,
  extra: Partial<AppleNote> = {},
): AppleNote => ({
  id,
  title,
  html,
  created: day(2),
  modified: day(5),
  locked: false,
  files: 0,
  ...extra,
})

const NOTES: Record<string, AppleNote[]> = {
  'f-notes': [
    note(
      'n1',
      'Groceries',
      '<div><b><span style="font-size: 24px">Groceries</span></b></div><div><br></div><ul><li>Milk</li><li>Bread</li></ul><div>Call <a href="https://example.com">the shop</a></div>',
    ),
    note('n2', 'Secret', '', { locked: true }),
  ],
  'f-work': [
    note(
      'n3',
      'Plan',
      `<div><h1>Plan</h1></div><div>First <b>bold</b> and <i>italic</i> and <u>underlined</u>.</div><div><br></div><div><tt>let a = 1</tt></div><div><tt>let b = 2</tt></div><div><br></div><div><img src="${PNG}"></div><div>After the picture</div>`,
      { files: 2 },
    ),
    note(
      'n4',
      'Table',
      '<div><h2>Table</h2></div><table><tbody><tr><td><div>A</div></td><td><div>B</div></td></tr><tr><td><div>1</div></td><td><div>2</div></td></tr></tbody></table>',
    ),
  ],
  'f-q3': [note('n5', 'Goals', '<div>Goals</div><div>Ship the import</div>')],
  'f-trash': [note('n6', 'Old', '<div>Old</div>')],
}

/** Apple Notes for `?dev-backend` (the real one needs the desktop app on a Mac); `?apple-denied` refuses once. */
export function devAppleNotes(): AppleNotesSource {
  let deny = new URLSearchParams(location.search).has('apple-denied')
  const wait = () => new Promise((r) => setTimeout(r, 400))
  return {
    folders: async () => {
      await wait()
      if (deny) {
        deny = false
        throw new Error('denied')
      }
      return FOLDERS
    },
    read: async (folder, from, count) => {
      await wait()
      return (NOTES[folder] ?? []).slice(from, from + count)
    },
  }
}
