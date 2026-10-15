import type { StoredCitation } from '@fixnote/core'
import { type CSSProperties, Fragment, memo, type ReactNode } from 'react'
import type { RevealClock } from '../../lib/reveal'

/**
 * A small, safe Markdown subset for assistant answers: paragraphs, lists, headings, **bold**,
 * *italic*, `code`, and [n] citations as buttons. Everything becomes React elements; model output
 * never reaches innerHTML.
 *
 * While an answer types itself in (`clock`), each word is a span keyed by where it starts in the
 * answer and fades in when it is shown; a word that re-mounts (a paragraph turning into a list,
 * a bold span closing) picks its fade up where it was. Finished blocks are memoized, so a frame
 * re-renders only the block being written.
 */

interface Ctx {
  citations: StoredCitation[]
  onCite: (c: StoredCitation) => void
  clock: RevealClock | null
}

/** Starts a fade at the moment `offset` was shown (a negative delay if that was a while ago). */
function fade(ctx: Ctx, offset: number): { className?: string; style?: CSSProperties } {
  if (!ctx.clock) return {}
  const ago = performance.now() - ctx.clock.at(offset)
  return { className: 'fx-word', style: ago > 16 ? { animationDelay: `${-ago}ms` } : undefined }
}

/** Plain text, word by word while it types in. */
function words(text: string, start: number, ctx: Ctx): ReactNode {
  if (!ctx.clock || !text) return text
  const out: ReactNode[] = []
  for (const m of text.matchAll(/\s*\S+\s*|\s+/g)) {
    const at = start + (m.index ?? 0)
    out.push(
      <span key={at} {...fade(ctx, at)}>
        {m[0]}
      </span>,
    )
  }
  return out
}

function inline(text: string, start: number, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\d+(?:\s*,\s*\d+)*\])/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const token = m[0]
    const at = m.index ?? 0
    const key = start + at
    if (at > last)
      out.push(
        <Fragment key={start + last}>{words(text.slice(last, at), start + last, ctx)}</Fragment>,
      )
    if (token.startsWith('**'))
      out.push(<strong key={key}>{words(token.slice(2, -2), key + 2, ctx)}</strong>)
    else if (token.startsWith('`'))
      out.push(
        <code key={key} {...fade(ctx, key)}>
          {token.slice(1, -1)}
        </code>,
      )
    else if (token.startsWith('*'))
      out.push(<em key={key}>{words(token.slice(1, -1), key + 1, ctx)}</em>)
    else {
      let i = 0
      for (const n of token
        .slice(1, -1)
        .split(',')
        .map((x) => Number(x.trim()))) {
        const c = ctx.citations.find((x) => x.n === n)
        const look = fade(ctx, key)
        out.push(
          c ? (
            <button
              key={`${key}-${i++}`}
              type="button"
              onClick={() => ctx.onCite(c)}
              title={c.title}
              style={look.style}
              className={`mx-0.5 inline-flex h-4 min-w-4 -translate-y-px items-center justify-center rounded bg-brand/12 px-1 align-middle text-[10px] font-semibold text-brand hover:bg-brand/20 ${look.className ?? ''}`}
            >
              {n}
            </button>
          ) : (
            <Fragment key={`${key}-${i++}`}>[{n}]</Fragment>
          ),
        )
      }
    }
    last = at + token.length
  }
  if (last < text.length)
    out.push(<Fragment key={start + last}>{words(text.slice(last), start + last, ctx)}</Fragment>)
  return out
}

const LIST_MARK = /^\s*(?:[-*•]|\d+[.)])\s+/

/** Splits `text` at `sep`, keeping where each piece starts. */
function pieces(text: string, sep: RegExp, start: number): { src: string; at: number }[] {
  const out: { src: string; at: number }[] = []
  let last = 0
  for (const m of text.matchAll(sep)) {
    const at = m.index ?? 0
    out.push({ src: text.slice(last, at), at: start + last })
    last = at + m[0].length
  }
  out.push({ src: text.slice(last), at: start + last })
  return out
}

const Block = memo(function Block({
  src,
  at,
  citations,
  onCite,
  clock,
  tail,
}: {
  src: string
  at: number
  citations: StoredCitation[]
  onCite: (c: StoredCitation) => void
  clock: RevealClock | null
  tail?: ReactNode
}) {
  const ctx: Ctx = { citations, onCite, clock }
  const lines = pieces(src, /\n/g, at).filter((l) => l.src.trim())
  const isList = lines.length > 0 && lines.every((l) => LIST_MARK.test(l.src))
  if (isList) {
    const ordered = /^\s*\d/.test(lines[0]?.src ?? '')
    const items = lines.map((l, li) => {
      const mark = l.src.match(LIST_MARK)?.[0].length ?? 0
      return (
        <li key={l.at}>
          {inline(l.src.slice(mark), l.at + mark, ctx)}
          {li === lines.length - 1 ? tail : null}
        </li>
      )
    })
    return ordered ? (
      <ol className="list-decimal space-y-1 pl-5">{items}</ol>
    ) : (
      <ul className="list-disc space-y-1 pl-5">{items}</ul>
    )
  }
  return (
    <p className="whitespace-pre-wrap">
      {lines.map((l, li) => {
        const heading = l.src.match(/^#{1,6}\s+/)?.[0].length ?? 0
        return (
          <Fragment key={l.at}>
            {li ? '\n' : null}
            {heading ? (
              <strong>{inline(l.src.slice(heading), l.at + heading, ctx)}</strong>
            ) : (
              inline(l.src, l.at, ctx)
            )}
          </Fragment>
        )
      })}
      {tail}
    </p>
  )
})

/** The soft caret at the end of an answer that is still typing. */
function Caret() {
  return <span aria-hidden className="fx-caret" />
}

export function AnswerText({
  text,
  citations,
  onCite,
  clock = null,
  typing = false,
}: {
  text: string
  citations: StoredCitation[]
  onCite: (c: StoredCitation) => void
  /** Set while the answer types itself in (`useReveal`). */
  clock?: RevealClock | null
  /** Shows a caret after the last word. */
  typing?: boolean
}) {
  const blocks = pieces(text, /\n\s*\n/g, 0)
  return (
    <div data-selectable className="space-y-2 text-[14px] leading-relaxed">
      {blocks.map((b, bi) => (
        <Block
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks only grow at the end
          key={bi}
          src={b.src}
          at={b.at}
          citations={citations}
          onCite={onCite}
          clock={clock}
          tail={typing && bi === blocks.length - 1 ? <Caret /> : undefined}
        />
      ))}
    </div>
  )
}
