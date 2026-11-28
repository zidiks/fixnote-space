export type AttachmentKind =
  | 'image'
  | 'pdf'
  | 'spreadsheet'
  | 'docx'
  | 'text'
  | 'audio'
  | 'video'
  | 'other'

const EXT_KIND: Record<string, AttachmentKind> = {
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'image',
  bmp: 'image',
  avif: 'image',
  ico: 'image',
  // PDF
  pdf: 'pdf',
  // Spreadsheets / tables
  xlsx: 'spreadsheet',
  xls: 'spreadsheet',
  xlsm: 'spreadsheet',
  xlsb: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  tsv: 'spreadsheet',
  // Word documents
  docx: 'docx',
  // Text / code / markup
  txt: 'text',
  md: 'text',
  markdown: 'text',
  json: 'text',
  xml: 'text',
  yaml: 'text',
  yml: 'text',
  toml: 'text',
  ini: 'text',
  log: 'text',
  rtf: 'text',
  html: 'text',
  htm: 'text',
  css: 'text',
  js: 'text',
  mjs: 'text',
  cjs: 'text',
  ts: 'text',
  tsx: 'text',
  jsx: 'text',
  py: 'text',
  rs: 'text',
  go: 'text',
  java: 'text',
  c: 'text',
  cpp: 'text',
  h: 'text',
  sh: 'text',
  sql: 'text',
  // Audio
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  flac: 'audio',
  aac: 'audio',
  opus: 'audio',
  // Video
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
}

const MIME_KIND: Record<string, AttachmentKind> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.oasis.opendocument.spreadsheet': 'spreadsheet',
  'text/csv': 'spreadsheet',
  'application/csv': 'spreadsheet',
  'text/tab-separated-values': 'spreadsheet',
  'application/json': 'text',
  'application/xml': 'text',
  'application/rtf': 'text',
  'text/rtf': 'text',
}

export function fileExtension(name: string): string {
  const clean = name.trim().split(/[?#]/)[0] ?? ''
  const dot = clean.lastIndexOf('.')
  if (dot <= 0 || dot === clean.length - 1) return ''
  return clean.slice(dot + 1).toLowerCase()
}

export function attachmentKind(name = '', mime = ''): AttachmentKind {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (m && m !== 'application/octet-stream') {
    const direct = MIME_KIND[m]
    if (direct) return direct
    if (m.startsWith('image/')) return 'image'
    if (m.startsWith('audio/')) return 'audio'
    if (m.startsWith('video/')) return 'video'
    if (m.startsWith('text/')) {
      const ext = fileExtension(name)
      if (ext === 'csv' || ext === 'tsv') return 'spreadsheet'
      return 'text'
    }
  }
  const ext = fileExtension(name)
  if (ext && EXT_KIND[ext]) return EXT_KIND[ext]
  return 'other'
}

export function attachmentBadge(name = '', mime = ''): string {
  const ext = fileExtension(name)
  if (ext && ext.length <= 5) return ext.toUpperCase()
  const kind = attachmentKind(name, mime)
  switch (kind) {
    case 'pdf':
      return 'PDF'
    case 'docx':
      return 'DOCX'
    case 'spreadsheet':
      return 'XLSX'
    case 'image':
      return 'IMG'
    case 'text':
      return 'TXT'
    case 'audio':
      return 'AUDIO'
    case 'video':
      return 'VIDEO'
    default:
      return 'FILE'
  }
}

export function isTextIndexable(kind: AttachmentKind): boolean {
  return (
    kind === 'image' ||
    kind === 'pdf' ||
    kind === 'spreadsheet' ||
    kind === 'docx' ||
    kind === 'text'
  )
}

function bytesContainAscii(bytes: Uint8Array, needle: string): boolean {
  const len = needle.length
  if (bytes.length < len) return false
  const codes = Array.from(needle, (c) => c.charCodeAt(0))
  const limit = Math.min(bytes.length - len, 65_536)
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < len; j++) {
      if (bytes[i + j] !== codes[j]) continue outer
    }
    return true
  }
  return false
}

function looksLikeUtf8Text(bytes: Uint8Array): boolean {
  const sample = Math.min(bytes.length, 2048)
  if (sample === 0) return false
  let suspicious = 0
  for (let i = 0; i < sample; i++) {
    const b = bytes[i] ?? 0
    if (b === 0) return false
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) suspicious++
  }
  return suspicious / sample < 0.05
}

/**
 * Classifies a blob when MIME or filename is generic (`application/octet-stream`), by inspecting
 * file header signatures (PDF, OOXML DOCX/XLSX, legacy XLS, images, UTF-8 text).
 */
export function sniffAttachmentKind(bytes: Uint8Array, name = '', mime = ''): AttachmentKind {
  const known = attachmentKind(name, mime)
  if (known !== 'other') return known
  if (bytes.length >= 5) {
    // %PDF-
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    ) {
      return 'pdf'
    }
    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image'
    }
    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image'
    }
    // GIF
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image'
    }
    // WebP (RIFF....WEBP)
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image'
    }
    // OLE2 compound document (.xls)
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      return 'spreadsheet'
    }
    // ZIP container: distinguish DOCX vs XLSX/ODS
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      if (bytesContainAscii(bytes, 'word/')) return 'docx'
      if (bytesContainAscii(bytes, 'xl/') || bytesContainAscii(bytes, 'content.xml')) {
        return 'spreadsheet'
      }
      return 'other'
    }
  }
  if (looksLikeUtf8Text(bytes)) return 'text'
  return 'other'
}
