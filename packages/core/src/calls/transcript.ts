/**
 * Call notes: the transcript of a recorded call (the microphone is "me", what the computer plays
 * is "them") and the note made from it. Pure functions; recording and transcription live in the
 * app, the summary prompt in @fixnote/ai.
 */

export type Speaker = 'me' | 'them'

/** A transcribed piece of one side of the call, placed in time since the call started. */
export interface CallPiece {
  speaker: Speaker
  startMs: number
  endMs: number
  text: string
}

/** The model's write-up; every part may be empty. */
export interface CallSummary {
  summary: string
  decisions: string[]
  tasks: string[]
}

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)

/** How far apart in time the same words can be heard by the two sides (buffers, cuts). */
const ECHO_SLACK_MS = 3000
/** Share of my words found in what the others said at the same time that makes it their echo. */
const ECHO_SHARE = 0.6

/**
 * Without headphones the microphone also hears the others from the speakers: my pieces that
 * repeat what they said at the same time are dropped.
 */
export function dropEcho(pieces: readonly CallPiece[]): CallPiece[] {
  const theirs = pieces.filter((p) => p.speaker === 'them')
  return pieces.filter((p) => {
    if (p.speaker !== 'me') return true
    const mine = words(p.text)
    if (!mine.length) return false
    const heard = new Set(
      theirs
        .filter((t) => t.startMs - ECHO_SLACK_MS < p.endMs && t.endMs + ECHO_SLACK_MS > p.startMs)
        .flatMap((t) => words(t.text)),
    )
    if (!heard.size) return true
    const repeated = mine.filter((w) => heard.has(w)).length
    return repeated / mine.length < ECHO_SHARE
  })
}

export interface Turn {
  speaker: Speaker
  startMs: number
  text: string
}

/** The pieces in time order, one turn per stretch of the same speaker. */
export function callTurns(pieces: readonly CallPiece[]): Turn[] {
  const turns: Turn[] = []
  for (const p of [...pieces].sort((a, b) => a.startMs - b.startMs)) {
    const text = p.text.trim()
    if (!text) continue
    const last = turns.at(-1)
    if (last && last.speaker === p.speaker) last.text = `${last.text} ${text}`
    else turns.push({ speaker: p.speaker, startMs: p.startMs, text })
  }
  return turns
}

/** m:ss, or h:mm:ss past an hour. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** The transcript as plain lines for the model: "[0:12] Me: …". */
export function transcriptText(turns: readonly Turn[], names: Record<Speaker, string>): string {
  return turns.map((t) => `[${clock(t.startMs)}] ${names[t.speaker]}: ${t.text}`).join('\n')
}

export interface CallNoteLabels {
  me: string
  them: string
  summary: string
  decisions: string
  tasks: string
  transcript: string
}

/** Markdown special characters at the start of a line would turn text into lists or headings. */
const escapeLine = (text: string) =>
  text.replace(/[\\`*_[\]<>]/g, (c) => `\\${c}`).replace(/^(\s*)([#>+-]|\d+[.)])(\s)/, '$1\\$2$3')

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * The call's note: the title, then only the parts the call had (summary, decisions, tasks as
 * checkboxes), then the transcript, folded away when there is a summary above it.
 */
export function callNoteMarkdown(opts: {
  title: string
  summary: CallSummary | null
  turns: readonly Turn[]
  labels: CallNoteLabels
}): string {
  const { labels, summary } = opts
  const parts = [`# ${oneLine(opts.title)}`]
  const decisions = summary?.decisions.map(oneLine).filter(Boolean) ?? []
  const tasks = summary?.tasks.map(oneLine).filter(Boolean) ?? []
  const about = summary?.summary.trim() ?? ''
  if (about) {
    parts.push(
      `## ${labels.summary}`,
      about
        .split(/\n{2,}/)
        .map((p) => escapeLine(oneLine(p)))
        .join('\n\n'),
    )
  }
  if (decisions.length) {
    parts.push(`## ${labels.decisions}`, decisions.map((d) => `- ${escapeLine(d)}`).join('\n'))
  }
  if (tasks.length) {
    parts.push(`## ${labels.tasks}`, tasks.map((t) => `- [ ] ${escapeLine(t)}`).join('\n'))
  }
  const lines = opts.turns.map(
    (t) =>
      `**${t.speaker === 'me' ? labels.me : labels.them}, ${clock(t.startMs)}.** ${escapeLine(oneLine(t.text))}`,
  )
  if (lines.length) {
    const body = lines.join('\n\n')
    const written = about || decisions.length || tasks.length
    parts.push(
      written
        ? `<details>\n<summary>${labels.transcript}</summary>\n\n${body}\n\n</details>`
        : `## ${labels.transcript}\n\n${body}`,
    )
  }
  return `${parts.join('\n\n')}\n`
}
