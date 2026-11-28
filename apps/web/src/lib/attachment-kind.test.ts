import { describe, expect, it } from 'vitest'
import {
  attachmentBadge,
  attachmentKind,
  isTextIndexable,
  sniffAttachmentKind,
} from './attachment-kind'

describe('attachment-kind', () => {
  it('classifies common document, spreadsheet, PDF, and image types', () => {
    expect(attachmentKind('report.pdf', 'application/pdf')).toBe('pdf')
    expect(attachmentKind('proposal.docx', 'application/octet-stream')).toBe('docx')
    expect(attachmentKind('budget.xlsx', '')).toBe('spreadsheet')
    expect(attachmentKind('data.csv', 'text/plain')).toBe('spreadsheet')
    expect(attachmentKind('photo.webp', 'image/webp')).toBe('image')
    expect(attachmentKind('notes.md', 'text/markdown')).toBe('text')
    expect(attachmentKind('archive.zip', 'application/zip')).toBe('other')
  })

  it('produces short uppercase badges', () => {
    expect(attachmentBadge('Q4_2026.pdf')).toBe('PDF')
    expect(attachmentBadge('plan.docx')).toBe('DOCX')
    expect(attachmentBadge('sheet.xlsx')).toBe('XLSX')
    expect(attachmentBadge('unnamed', 'application/pdf')).toBe('PDF')
  })

  it('sniffs file types from magic bytes when MIME and filename are generic', () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj')
    expect(sniffAttachmentKind(pdfBytes, '', 'application/octet-stream')).toBe('pdf')

    const docxZip = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04,
      ...new TextEncoder().encode('word/document.xml'),
    ])
    expect(sniffAttachmentKind(docxZip, '', 'application/octet-stream')).toBe('docx')

    const xlsxZip = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04,
      ...new TextEncoder().encode('xl/workbook.xml'),
    ])
    expect(sniffAttachmentKind(xlsxZip, '', 'application/octet-stream')).toBe('spreadsheet')

    const plainUtf8 = new TextEncoder().encode('Quarterly numbers: 10, 20, 30\n')
    expect(sniffAttachmentKind(plainUtf8, '', 'application/octet-stream')).toBe('text')

    expect(isTextIndexable('pdf')).toBe(true)
    expect(isTextIndexable('docx')).toBe(true)
    expect(isTextIndexable('spreadsheet')).toBe(true)
    expect(isTextIndexable('audio')).toBe(false)
  })
})
