import type { StoredCitation } from '@fixnote/core'
import { Fragment, type ReactNode } from 'react'

/**
 * A small, safe Markdown subset for assistant answers: paragraphs, lists, headings, **bold**,
 * *italic*, `code`, and [n] citations as buttons. Everything becomes React elements; model output
 * never reaches innerHTML.
 */
function inline(
  text: string,
  citations: StoredCitation[],
  onCite: (c: StoredCitation) => void,
): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\d+(?:\s*,\s*\d+)*\])/g
  let last = 0
  let key = 0
  for (const m of text.matchAll(re)) {
    const token = m[0]
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    if (token.startsWith('**')) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) out.push(<code key={key++}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('*')) out.push(<em key={key++}>{token.slice(1, -1)}</em>)
    else {
      for (const n of token
        .slice(1, -1)
        .split(',')
        .map((x) => Number(x.trim()))) {
        const c = citations.find((x) => x.n === n)
        out.push(
          c ? (
            <button
              key={key++}
              type="button"
              onClick={() => onCite(c)}
              title={c.title}
              className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-px items-center justify-center rounded bg-brand/12 px-1 align-middle text-[10px] font-semibold text-brand hover:bg-brand/20"
            >
              {n}
            </button>
          ) : (
            <Fragment key={key++}>[{n}]</Fragment>
          ),
        )
      }
    }
    last = at + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function AnswerText({
  text,
  citations,
  onCite,
}: {
  text: string
  citations: StoredCitation[]
  onCite: (c: StoredCitation) => void
}) {
  const blocks = text.split(/\n\s*\n/)
  return (
    <div data-selectable className="space-y-2 text-[14px] leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim())
        const isList = lines.length > 0 && lines.every((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l))
        if (isList) {
          const ordered = /^\s*\d/.test(lines[0] ?? '')
          const items = lines.map((l, li) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static render of streamed text
            <li key={li}>{inline(l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''), citations, onCite)}</li>
          ))
          return ordered ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static render of streamed text
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: static render of streamed text
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          )
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static render of streamed text
          <p key={bi} className="whitespace-pre-wrap">
            {lines.map((l, li) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static render of streamed text
              <Fragment key={li}>
                {li ? '\n' : null}
                {/^#{1,6}\s/.test(l) ? (
                  <strong>{inline(l.replace(/^#{1,6}\s+/, ''), citations, onCite)}</strong>
                ) : (
                  inline(l, citations, onCite)
                )}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
