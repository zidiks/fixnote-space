export type SecretKind = 'privateKey' | 'token' | 'password' | 'accessCode' | 'personalData'

export interface SecretCandidate {
  /** UTF-16 offsets in the original text, with an exclusive end. */
  from: number
  to: number
  kind: SecretKind
}

const TOKENS =
  /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,255}|xox[baprs]-[A-Za-z0-9-]{16,180}|sk_(?:live|test)_[A-Za-z0-9]{16,180}|sk-(?:proj-)?[A-Za-z0-9_-]{32,200})\b/g
const FIELD =
  /(?:^|[\s"'*|{,(])(?<label>password|passwd|pwd|пароль(?:[ \t]+(?:от|для)[ \t]+[^:=\r\n]{1,60})?|contraseña|(?:api|access|private)[_-]?key|(?:client[_-]?)?secret|(?:access[_-]?)?token|authorization|pin(?:[ \t]+(?:карты|code))?|пин(?:-код)?|код[ \t]+(?:домофона|доступа|сейфа|калитки)|номер[ \t]+(?:карты|паспорта)|дата[ \t]+рождения)(?:["'* \t]{0,8})[:=|][ \t]{0,16}(?<value>"[^"\r\n]{1,512}"|'[^'\r\n]{1,512}'|[^\r\n|]{1,512})/giu
const EXAMPLE =
  /^(?:<[^<>]+>|\$\{[^{}]+\}|\*{2,}|•{2,}|x{4,}|(?:your|example|dummy|placeholder)[_-](?:api[_-])?(?:key|token|secret|password)(?:[_-]here)?|(?:redacted|changeme|undefined|null|todo|n\/a))$/i
const TOKEN_LABEL = /(?:key|secret|token|authorization)/i
const CODE_LABEL = /^(?:pin|пин|код)/iu
const PERSONAL_LABEL = /^(?:номер|дата)/u

/** Advisory only. Returns ranges and kinds, never copied values or a protection decision. */
export function detectSecrets(text: string): SecretCandidate[] {
  const hits: SecretCandidate[] = []
  // Pair headers and trailers in a single pass so many incomplete headers cannot cause
  // a repeated search to the end of a long paste.
  const markers =
    /^(-----(BEGIN|END) ((?:(?:RSA|DSA|EC|OPENSSH|ENCRYPTED) )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----)[ \t]*\r?$/gm
  let start: { from: number; body: number; label: string } | undefined
  for (const m of text.matchAll(markers)) {
    if (m[2] === 'BEGIN') {
      start = { from: m.index, body: m.index + m[0].length, label: m[3] as string }
      continue
    }
    if (start && start.label === m[3] && text.slice(start.body, m.index).trim()) {
      hits.push({ from: start.from, to: m.index + (m[1]?.length ?? 0), kind: 'privateKey' })
    }
    start = undefined
  }
  for (const m of text.matchAll(TOKENS)) {
    hits.push({ from: m.index, to: m.index + m[0].length, kind: 'token' })
  }
  for (const m of text.matchAll(FIELD)) {
    const label = m.groups?.label?.toLowerCase()
    const raw = m.groups?.value
    if (label === undefined || raw === undefined) continue
    const unwrapped = raw.trim().replace(/^["'\x60]|["'\x60]$/g, '')
    const value = unwrapped
      .replace(/^Bearer[ \t]+/i, '')
      .replace(/[,;][ \t]*$/, '')
      .trim()
    if (!value || EXAMPLE.test(value)) continue
    let kind: SecretKind = 'password'
    if (CODE_LABEL.test(label)) {
      if (!/^\d{3,10}$/.test(value)) continue
      kind = 'accessCode'
    } else if (PERSONAL_LABEL.test(label)) {
      if (!/^[\p{L}\d ./-]{4,40}$/u.test(value) || !/\d/.test(value)) continue
      kind = 'personalData'
    } else if (TOKEN_LABEL.test(label)) {
      if (!/^\S{8,512}$/.test(value)) continue
      kind = 'token'
    }
    const from = m.index + m[0].length - raw.length + raw.indexOf(value)
    hits.push({ from, to: from + value.length, kind })
  }
  hits.sort((a, b) => a.from - b.from || b.to - a.to)
  const merged: SecretCandidate[] = []
  for (const hit of hits) {
    const prev = merged.at(-1)
    if (prev && hit.from < prev.to) prev.to = Math.max(prev.to, hit.to)
    else merged.push(hit)
  }
  return merged
}
