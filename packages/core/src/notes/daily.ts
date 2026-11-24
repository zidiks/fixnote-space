import { unionLines } from '../sync/merge'

/** Task list items as the editor writes them: `- [ ] text` / `- [x] text`, any indentation. */
const TASK = /^([ \t]*)([-*+]) \[( |x|X)\](?:\s+(.*\S))?\s*$/
const FENCE = /^[ \t]*(`{3,}|~{3,})/

/** An unfinished task with its normalized nesting depth (0 = top-level, 1 = subtask, ...). */
export interface DailyTask {
  text: string
  depth: number
}

interface TaskNode {
  text: string
  children: TaskNode[]
}

interface ParsedTaskLine {
  index: number
  rawIndent: number
  indent: string
  open: boolean
  text: string
  /** Ancestor path through all task lines (open or done), including this task. */
  allPath: string[]
  /** Ancestor path through open task lines only, including this task when open. */
  openPath: string[]
}

const pathKey = (path: readonly string[]) => path.join('\0')

function indentWidth(ws: string): number {
  let width = 0
  for (const ch of ws) width += ch === '\t' ? 4 : 1
  return width
}

function updateFence(
  line: string,
  fence: { char: string; len: number } | null,
): { fence: { char: string; len: number } | null; inside: boolean } {
  if (!fence) {
    const m = line.match(FENCE)
    if (m?.[1]) return { fence: { char: m[1][0] as string, len: m[1].length }, inside: true }
    return { fence: null, inside: false }
  }
  const trimmed = line.trim()
  if (trimmed.length >= fence.len && [...trimmed].every((ch) => ch === fence.char)) {
    return { fence: null, inside: true }
  }
  return { fence, inside: true }
}

function parseTaskLines(lines: readonly string[]): ParsedTaskLine[] {
  const out: ParsedTaskLine[] = []
  const stack: { rawIndent: number; allPath: string[]; openPath: string[] }[] = []
  let fence: { char: string; len: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const nextFence = updateFence(line, fence)
    fence = nextFence.fence
    if (nextFence.inside) {
      stack.length = 0
      continue
    }
    const m = line.match(TASK)
    if (!m) {
      if (line.trim()) {
        const rawIndent = indentWidth(line.match(/^[ \t]*/)?.[0] ?? '')
        while (stack.length && (stack.at(-1)?.rawIndent ?? 0) >= rawIndent) stack.pop()
      }
      continue
    }
    const indent = m[1] ?? ''
    const rawIndent = indentWidth(indent)
    while (stack.length && (stack.at(-1)?.rawIndent ?? 0) >= rawIndent) stack.pop()
    const open = m[3] === ' '
    const text = m[4] ?? ''
    const parent = stack.at(-1)
    const allPath = text ? [...(parent?.allPath ?? []), text] : [...(parent?.allPath ?? [])]
    const openPath =
      open && text ? [...(parent?.openPath ?? []), text] : [...(parent?.openPath ?? [])]
    stack.push({ rawIndent, allPath, openPath })
    out.push({ index: i, rawIndent, indent, open, text, allPath, openPath })
  }
  return out
}

function insertPath(forest: TaskNode[], path: readonly string[]) {
  let level = forest
  for (const text of path) {
    let node = level.find((n) => n.text === text)
    if (!node) {
      node = { text, children: [] }
      level.push(node)
    }
    level = node.children
  }
}

function toForest(tasks: readonly (string | DailyTask)[]): TaskNode[] {
  const forest: TaskNode[] = []
  const stack: string[] = []
  for (const raw of tasks) {
    const text = typeof raw === 'string' ? raw : raw.text
    if (!text) continue
    const depth = typeof raw === 'string' ? 0 : Math.max(0, Math.min(raw.depth, stack.length))
    stack.length = depth
    stack.push(text)
    insertPath(forest, stack)
  }
  return forest
}

function flattenForest(nodes: readonly TaskNode[], depth = 0, out: DailyTask[] = []): DailyTask[] {
  for (const node of nodes) {
    out.push({ text: node.text, depth })
    flattenForest(node.children, depth + 1, out)
  }
  return out
}

function formatSubtree(
  node: TaskNode,
  baseIndent: string,
  havePaths: Set<string>,
  prefix: readonly string[],
  out: string[],
) {
  const path = [...prefix, node.text]
  havePaths.add(pathKey(path))
  out.push(`${baseIndent}- [ ] ${node.text}`)
  for (const child of node.children) {
    formatSubtree(child, `${baseIndent}  `, havePaths, path, out)
  }
}

/**
 * Unfinished tasks in order, keeping their nesting hierarchy (0 = top-level, 1 = child, ...).
 * Empty checkboxes and completed tasks are skipped; identical paths are deduplicated while
 * identical subtasks under different parents stay distinct.
 */
export function openTaskItems(markdown: string): DailyTask[] {
  const forest: TaskNode[] = []
  for (const entry of parseTaskLines(markdown.split('\n'))) {
    if (entry.open && entry.text) insertPath(forest, entry.openPath)
  }
  return flattenForest(forest)
}

/** Merge several hierarchical task lists (e.g. from multiple earlier days) without duplicate paths. */
export function mergeTaskItems(...lists: readonly (readonly DailyTask[])[]): DailyTask[] {
  const forest: TaskNode[] = []
  for (const list of lists) {
    const stack: string[] = []
    for (const item of list) {
      if (!item.text) continue
      const depth = Math.max(0, Math.min(item.depth, stack.length))
      stack.length = depth
      stack.push(item.text)
      insertPath(forest, stack)
    }
  }
  return flattenForest(forest)
}

/** Texts of unfinished tasks, in order, without duplicates. Empty checkboxes are skipped. */
export function openTasks(markdown: string): string[] {
  const out: string[] = []
  for (const item of openTaskItems(markdown)) {
    if (!out.includes(item.text)) out.push(item.text)
  }
  return out
}

/**
 * The note without the given unfinished tasks (they moved to another day).
 * When an open parent is removed, any surviving descendants underneath it are dedented so they do
 * not attach to an unrelated task above.
 */
export function withoutTasks(
  markdown: string,
  tasks: readonly (string | DailyTask)[],
  opts?: { keepFrom?: string },
): string {
  if (!tasks.length) return markdown
  const flatTexts = new Set<string>()
  const targetPaths = new Set<string>()
  const taskStack: string[] = []
  for (const raw of tasks) {
    if (typeof raw === 'string') {
      flatTexts.add(raw)
    } else if (raw.text) {
      const depth = Math.max(0, Math.min(raw.depth, taskStack.length))
      taskStack.length = depth
      taskStack.push(raw.text)
      targetPaths.add(pathKey(taskStack))
    }
  }
  const keepPaths = new Set<string>()
  if (opts?.keepFrom) {
    for (const entry of parseTaskLines(opts.keepFrom.split('\n'))) {
      if (!entry.text) continue
      keepPaths.add(pathKey(entry.allPath))
      if (entry.open) keepPaths.add(pathKey(entry.openPath))
    }
  }

  const lines = markdown.split('\n')
  const out: string[] = []
  const stack: {
    rawIndent: number
    allPath: string[]
    openPath: string[]
    removed: boolean
    keptIndent: string | null
  }[] = []
  let fence: { char: string; len: number } | null = null

  for (const line of lines) {
    const nextFence = updateFence(line, fence)
    fence = nextFence.fence
    if (nextFence.inside) {
      stack.length = 0
      out.push(line)
      continue
    }
    const m = line.match(TASK)
    if (!m) {
      if (line.trim()) {
        const rawIndent = indentWidth(line.match(/^[ \t]*/)?.[0] ?? '')
        while (stack.length && (stack.at(-1)?.rawIndent ?? 0) >= rawIndent) stack.pop()
      }
      out.push(line)
      continue
    }
    const indent = m[1] ?? ''
    const rawIndent = indentWidth(indent)
    while (stack.length && (stack.at(-1)?.rawIndent ?? 0) >= rawIndent) stack.pop()
    const open = m[3] === ' '
    const text = m[4] ?? ''
    const parent = stack.at(-1)
    const allPath = text ? [...(parent?.allPath ?? []), text] : [...(parent?.allPath ?? [])]
    const openPath =
      open && text ? [...(parent?.openPath ?? []), text] : [...(parent?.openPath ?? [])]
    const allKey = pathKey(allPath)
    const openKey = pathKey(openPath)

    const preserved = Boolean(text) && (keepPaths.has(allKey) || (open && keepPaths.has(openKey)))
    const matches =
      open &&
      Boolean(text) &&
      !preserved &&
      (flatTexts.has(text) || targetPaths.has(openKey) || targetPaths.has(allKey))

    const hadRemovedAncestor = stack.some((s) => s.removed)
    let nearestKeptIndent: string | null = null
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i]
      if (entry && !entry.removed && entry.keptIndent !== null) {
        nearestKeptIndent = entry.keptIndent
        break
      }
    }

    if (matches) {
      stack.push({ rawIndent, allPath, openPath, removed: true, keptIndent: nearestKeptIndent })
      continue
    }
    if (hadRemovedAncestor) {
      const nextIndent = nearestKeptIndent === null ? '' : `${nearestKeptIndent}  `
      stack.push({ rawIndent, allPath, openPath, removed: false, keptIndent: nextIndent })
      out.push(`${nextIndent}${line.trimStart()}`)
    } else {
      stack.push({ rawIndent, allPath, openPath, removed: false, keptIndent: indent })
      out.push(line)
    }
  }
  return out.join('\n')
}

/**
 * Adds tasks to a note: in place of the template's empty checkbox, else after its first task list,
 * else at the end. Tasks the note already has are not repeated; new children of an existing parent
 * are placed under that parent.
 */
export function addTasks(markdown: string, tasks: readonly (string | DailyTask)[]): string {
  const forest = toForest(tasks)
  if (!forest.length) return markdown

  const lines = markdown.split('\n')
  const parsed = parseTaskLines(lines)
  const havePaths = new Set<string>()
  const existingByPath = new Map<string, { endLine: number; indent: string }>()

  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i] as ParsedTaskLine
    if (!entry.text) continue
    const key = pathKey(entry.allPath)
    havePaths.add(key)
    let endLine = entry.index
    for (let j = i + 1; j < parsed.length; j++) {
      const next = parsed[j] as ParsedTaskLine
      if (
        next.rawIndent <= entry.rawIndent ||
        next.allPath.length <= entry.allPath.length ||
        !entry.allPath.every((part, idx) => next.allPath[idx] === part)
      )
        break
      endLine = next.index
    }
    if (!existingByPath.has(key)) existingByPath.set(key, { endLine, indent: entry.indent })
  }

  const insertAfter = new Map<number, string[]>()
  const topLevelLines: string[] = []

  const collect = (nodes: readonly TaskNode[], prefix: readonly string[]) => {
    for (const node of nodes) {
      const path = [...prefix, node.text]
      const key = pathKey(path)
      if (!havePaths.has(key)) {
        if (!prefix.length) {
          formatSubtree(node, '', havePaths, [], topLevelLines)
        } else {
          const parentInfo = existingByPath.get(pathKey(prefix))
          if (parentInfo) {
            const bucket = insertAfter.get(parentInfo.endLine) ?? []
            formatSubtree(node, `${parentInfo.indent}  `, havePaths, prefix, bucket)
            insertAfter.set(parentInfo.endLine, bucket)
          } else {
            formatSubtree(node, '', havePaths, [], topLevelLines)
          }
        }
      } else if (node.children.length) {
        collect(node.children, path)
      }
    }
  }
  collect(forest, [])

  if (!insertAfter.size && !topLevelLines.length) return markdown

  if (insertAfter.size) {
    for (const lineIdx of [...insertAfter.keys()].sort((a, b) => b - a)) {
      const additions = insertAfter.get(lineIdx)
      if (additions?.length) lines.splice(lineIdx + 1, 0, ...additions)
    }
  }

  if (!topLevelLines.length) return lines.join('\n')

  const reparsed = parseTaskLines(lines)
  const empty = reparsed.find((e) => e.rawIndent === 0 && e.open && !e.text)
  if (empty) {
    lines.splice(empty.index, 1, ...topLevelLines)
    return lines.join('\n')
  }
  const first = reparsed[0]
  if (first) {
    let last = first.index
    let fence: { char: string; len: number } | null = null
    while (last + 1 < lines.length) {
      const nextLine = lines[last + 1] as string
      const nextFence = updateFence(nextLine, fence)
      fence = nextFence.fence
      if (nextFence.inside || !TASK.test(nextLine)) break
      last++
    }
    lines.splice(last + 1, 0, ...topLevelLines)
    return lines.join('\n')
  }
  return `${lines.join('\n').trimEnd()}\n\n${topLevelLines.join('\n')}\n`
}

/** Text appended to a daily note, e.g. from Telegram or dictation: stamped with the time. */
export function appendToDaily(markdown: string, text: string, time: string): string {
  return `${markdown.trimEnd()}\n\n${time} — ${text.trim()}\n`
}

/**
 * Two daily notes for the same date (made offline on two devices) as one: both texts, shared lines
 * once, each task once (done if it was done in either), no leftover empty checkbox when there are
 * real tasks. `first` is the note that keeps the date; the result depends only on the two texts.
 */
export function mergeDailyNotes(first: string, second: string): string {
  const lines = unionLines(first, second).split('\n')
  const tasks = lines.map((l) => l.match(TASK))
  const done = new Set(tasks.filter((m) => m?.[3] !== ' ' && m?.[4]).map((m) => m?.[4]))
  const hasTasks = tasks.some((m) => m?.[4])
  const seen = new Set<string>()
  const out: string[] = []
  lines.forEach((line, i) => {
    const m = tasks[i]
    if (!m) {
      // A blank line only once in a row.
      if (!line.trim() && !out.at(-1)?.trim() && out.length) return
      out.push(line)
      return
    }
    const text = m[4]
    if (!text) {
      if (!hasTasks) out.push(line)
      return
    }
    if (seen.has(text)) return
    seen.add(text)
    out.push(done.has(text) ? line.replace(/\[ \]/, '[x]') : line)
  })
  return out.join('\n')
}
