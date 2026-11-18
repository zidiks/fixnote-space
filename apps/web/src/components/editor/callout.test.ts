import { describe, expect, it } from 'vitest'
import { schemaEditor } from './headless'

const parse = (md: string) => schemaEditor().markdown?.parse(md)
const roundTrip = (md: string) => schemaEditor().markdown?.serialize(parse(md) ?? { type: 'doc' })

describe('Obsidian callouts', () => {
  it('read the type, the title and the body', () => {
    const doc = parse('> [!success] 7 applications\n> **1** closed · 0 offers\n> second line')
    const callout = doc?.content?.[0]
    expect(callout?.type).toBe('callout')
    expect(callout?.attrs).toMatchObject({ type: 'success', title: '7 applications', fold: '' })
    expect(JSON.stringify(callout?.content)).toContain('closed')
  })

  it('keep the Markdown as Obsidian writes it', () => {
    const md = '> [!todo] Next steps\n> - check replies\n> - follow up'
    expect(roundTrip(md)?.trim()).toBe(md)
  })

  it('keep the fold marker and an empty title', () => {
    expect(roundTrip('> [!note]- \n> hidden at first')?.trim()).toBe(
      '> [!note]-\n> hidden at first',
    )
  })

  it('leave plain quotes alone', () => {
    expect(parse('> just a quote')?.content?.[0]?.type).toBe('blockquote')
  })

  it('end at the first line that is not quoted', () => {
    const doc = parse('> [!info] Title\n> inside\n\nafter')
    expect(doc?.content?.map((n) => n.type)).toEqual(['callout', 'paragraph'])
  })
})
