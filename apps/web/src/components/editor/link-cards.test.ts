import type { LinkPreview } from '@fixnote/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { liftListItem, wrapInList } from '@tiptap/pm/schema-list'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { describe, expect, it, vi } from 'vitest'
import { schemaEditor } from './headless'
import { linkCardsPlugin, retryLinkCards } from './link-cards'
import { onlyLink } from './paragraph'

const schema = schemaEditor().schema
const paragraph = schema.nodes.paragraph
const docType = schema.nodes.doc
const link = schema.marks.link
const bulletList = schema.nodes.bulletList
const listItem = schema.nodes.listItem
if (!paragraph || !docType || !link || !bulletList || !listItem)
  throw new Error('Incomplete note schema')
const text = (value = 'Text') => paragraph.create(null, schema.text(value))
const bookmark = (url = 'https://example.com/a') =>
  paragraph.create(null, schema.text(url, [link.create({ href: url })]))
const doc = (...blocks: PmNode[]) => docType.create(null, blocks)

function setup(
  content: PmNode,
  load: (url: string) => Promise<LinkPreview | null> = async () => null,
) {
  const plugin = linkCardsPlugin({ load, open: () => {} })
  let state = EditorState.create({ schema, doc: content, plugins: [plugin] })
  const view = {
    get state() {
      return state
    },
    isDestroyed: false,
    dispatch(tr: Transaction) {
      state = state.apply(tr)
    },
  } as EditorView
  const lifecycle = plugin.spec.view?.(view)
  const decorations = () => plugin.getState(state)?.find() ?? []
  const captions = () => decorations().filter((d) => d.spec.kind === 'caption')
  const check = () => {
    // The independent Markdown/JSON recognizer defines which top-level blocks are bookmarks.
    const expected: { from: number; to: number; url: string }[] = []
    state.doc.forEach((node, pos) => {
      const url =
        node.type.name === 'paragraph' && !node.attrs.plainLink ? onlyLink(node.toJSON()) : null
      if (url) expected.push({ from: pos, to: pos + node.nodeSize, url })
    })
    expect(captions().map((d) => ({ from: d.from, to: d.to, url: d.spec.bookmarkUrl }))).toEqual(
      expected,
    )
    expect(
      decorations()
        .filter((d) => d.spec.kind === 'card')
        .map((d) => ({ pos: d.from, url: d.spec.bookmarkUrl })),
    ).toEqual(expected.map((b) => ({ pos: b.to, url: b.url })))
  }
  return {
    get state() {
      return state
    },
    plugin,
    view,
    decorations,
    captions,
    check,
    apply(tr: Transaction) {
      view.dispatch(tr)
      check()
    },
    destroy() {
      lifecycle?.destroy?.()
    },
  }
}

describe('incremental link cards', () => {
  it('preserves distant cards while text edits shift their positions', () => {
    const h = setup(doc(text(), text(), bookmark(), text(), text()))
    const original = h.decorations().find((d) => d.spec.kind === 'card')?.spec
    h.apply(h.state.tr.insertText('Before ', 1))
    h.apply(h.state.tr.insertText(' after', h.state.doc.content.size - 1))
    expect(h.decorations().find((d) => d.spec.kind === 'card')?.spec).toBe(original)
    h.destroy()
  })

  it('creates/removes bookmarks on mark-only and plainLink attribute transactions', () => {
    const url = 'https://example.com/a'
    const h = setup(doc(text(url), text()))
    h.apply(h.state.tr.addMark(1, url.length + 1, link.create({ href: url })))
    expect(h.captions()).toHaveLength(1)
    h.apply(h.state.tr.removeMark(1, url.length + 1, link))
    expect(h.captions()).toHaveLength(0)
    h.apply(h.state.tr.addMark(1, url.length + 1, link.create({ href: url })))
    h.apply(h.state.tr.setNodeAttribute(0, 'plainLink', true))
    expect(h.captions()).toHaveLength(0)
    h.apply(h.state.tr.setNodeAttribute(0, 'plainLink', false))
    expect(h.captions()).toHaveLength(1)
    h.destroy()
  })

  it('handles split, join, entire-block deletion and replacing the document', () => {
    const h = setup(doc(bookmark(), bookmark('https://example.com/b'), text()))
    h.apply(h.state.tr.split(10))
    h.apply(h.state.tr.join(h.state.doc.child(0).nodeSize))
    h.apply(h.state.tr.delete(0, h.state.doc.child(0).nodeSize))
    h.apply(h.state.tr.delete(0, h.state.doc.content.size))
    h.apply(h.state.tr.replaceWith(0, h.state.doc.content.size, [bookmark(), text(), bookmark()]))
    h.destroy()
  })

  it('handles distant edits, replacements and step positions mapped through later steps', () => {
    const h = setup(
      doc(
        bookmark(),
        text(),
        bookmark('https://example.com/b'),
        text(),
        bookmark('https://example.com/c'),
      ),
    )
    const before = h.state.doc
    h.apply(
      h.state.tr
        .insertText('x', 1)
        .insertText('y', h.state.doc.content.size)
        .insert(0, text('Prefix')),
    )
    h.apply(h.state.tr.replaceWith(0, h.state.doc.content.size, before.content))
    const tr = h.state.tr.delete(0, h.state.doc.child(0).nodeSize)
    tr.insertText('something', 1)
    tr.insert(0, bookmark('https://example.com/new'))
    h.apply(tr)
    h.destroy()
  })

  it('ignores nested bookmarks and restores them when lifted out of a list', () => {
    const h = setup(doc(bookmark(), text()))
    wrapInList(bulletList)(h.state, (tr) => h.apply(tr))
    expect(h.captions()).toHaveLength(0)
    expect(liftListItem(listItem)(h.state, (tr) => h.apply(tr))).toBe(true)
    expect(h.captions()).toHaveLength(1)
    h.destroy()
  })

  it('keeps decorations correct across undo and redo of a multi-step edit', () => {
    const h = setup(doc(bookmark(), text(), bookmark('https://example.com/b')))
    const original = h.state.doc
    const edit = h.state.tr.insertText('Changed ', 1).insert(0, text('Prefix'))
    h.apply(edit)
    const undo = h.state.tr
    for (let i = edit.steps.length - 1; i >= 0; i--) {
      const step = edit.steps[i],
        before = edit.docs[i]
      if (step && before) undo.step(step.invert(before))
    }
    h.apply(undo)
    expect(h.state.doc.eq(original)).toBe(true)
    const redo = h.state.tr
    for (const step of edit.steps) redo.step(step)
    h.apply(redo)
    h.destroy()
  })

  it('matches a full document scan through 250 mixed structural and text changes', () => {
    const h = setup(doc(bookmark(), text(), bookmark('https://example.com/b'), text()))
    let seed = 1729
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed
    }
    for (let i = 0; i < 250; i++) {
      const blocks: { node: PmNode; pos: number }[] = []
      h.state.doc.forEach((node, pos) => {
        blocks.push({ node, pos })
      })
      const index = random() % blocks.length
      const block = blocks[index]
      if (!block) throw new Error('Missing block')
      const tr = h.state.tr
      switch (i % 7) {
        case 0:
          tr.insert(block.pos, bookmark(`https://example.com/${i % 5}`))
          break
        case 1:
          tr.delete(block.pos, block.pos + block.node.nodeSize)
          break
        case 2:
          tr.replaceWith(block.pos, block.pos + block.node.nodeSize, i % 2 ? bookmark() : text())
          break
        case 3:
          tr.split(block.pos + 1 + (random() % (block.node.content.size + 1)))
          break
        case 4:
          if (index > 0) tr.join(block.pos)
          else tr.insertText('x', 1)
          break
        case 5:
          tr.insertText('!', block.pos + 1).insert(0, text('Prefix'))
          break
        case 6:
          tr.setNodeAttribute(block.pos, 'plainLink', !block.node.attrs.plainLink)
          break
      }
      h.apply(tr)
    }
    h.destroy()
  })

  it('updates every occurrence of a loaded URL without rebuilding unrelated cards', async () => {
    const loads = new Map<string, (preview: LinkPreview | null) => void>()
    const load = vi.fn(
      (url: string) => new Promise<LinkPreview | null>((resolve) => loads.set(url, resolve)),
    )
    const a = 'https://example.com/a',
      b = 'https://example.com/b'
    const h = setup(doc(bookmark(a), text(), bookmark(b), text(), bookmark(a)), load)
    expect(load).toHaveBeenCalledTimes(2)
    const untouched = h
      .decorations()
      .find((d) => d.spec.kind === 'card' && d.spec.bookmarkUrl === b)?.spec
    loads.get(a)?.({ url: a, kind: 'page', title: 'Loaded' })
    await vi.waitFor(() =>
      expect(
        h
          .decorations()
          .filter((d) => d.spec.kind === 'card' && d.spec.bookmarkUrl === a)
          .every((d) => d.spec.key.includes(':full:')),
      ).toBe(true),
    )
    expect(
      h.decorations().find((d) => d.spec.kind === 'card' && d.spec.bookmarkUrl === b)?.spec,
    ).toBe(untouched)
    h.check()
    h.destroy()
  })

  it('retries failed previews and tolerates late replies for deleted links', async () => {
    const url = 'https://example.com/a'
    const load = vi.fn(async (): Promise<LinkPreview | null> => null)
    const h = setup(doc(bookmark(url), text()), load)
    await vi.waitFor(() =>
      expect(h.decorations().some((d) => d.spec.key?.includes(':bare:'))).toBe(true),
    )
    let resolve: ((preview: LinkPreview | null) => void) | undefined
    load.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    retryLinkCards(h.view)
    expect(load).toHaveBeenCalledTimes(2)
    h.apply(h.state.tr.delete(0, h.state.doc.child(0).nodeSize))
    resolve?.({ url, kind: 'page', title: 'Late' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(h.captions()).toHaveLength(0)
    h.check()
    h.destroy()
  })

  it('does not dispatch a preview response after the view is destroyed', async () => {
    let finish: ((preview: LinkPreview | null) => void) | undefined
    const h = setup(
      doc(bookmark()),
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const dispatch = vi.spyOn(h.view, 'dispatch')
    h.destroy()
    finish?.({ url: 'https://example.com/a', kind: 'page', title: 'Late' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('renders and refreshes compact inline mention chips', async () => {
    const url = 'https://www.instagram.com/reels/DgMWPoARgoj/'
    let finish: ((preview: LinkPreview | null) => void) | undefined
    const mentionPara = paragraph.create(
      null,
      schema.text('instagram.com/reels/DgMWPoARgoj', [
        link.create({ href: url, title: 'mention' }),
      ]),
    )
    const h = setup(
      doc(mentionPara),
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    expect(h.decorations().some((d) => d.spec.kind === 'mention-chip')).toBe(true)
    expect(h.decorations().some((d) => d.spec.kind === 'mention-raw')).toBe(true)
    finish?.({ url, kind: 'page', site: 'Instagram', title: 'ANDREW BOLOTIN on Instagram' })
    await vi.waitFor(() =>
      expect(
        h
          .decorations()
          .some((d) => d.spec.kind === 'mention-chip' && d.spec.key?.includes(':full:')),
      ).toBe(true),
    )
    h.destroy()
  })
})
