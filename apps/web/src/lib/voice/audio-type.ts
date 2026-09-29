/**
 * The type of a recording from its first bytes. Files from the desktop app's storage come back
 * without one, and WebKit (macOS) will not play MP4 audio, which is what it records, from a
 * typeless blob; WebM from Windows played only because Chromium-like engines sniff it.
 */
export function audioType(head: Uint8Array): string {
  const at = (i: number, s: string) => [...s].every((c, k) => head[i + k] === c.charCodeAt(0))
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3)
    return 'audio/webm'
  if (at(0, 'OggS')) return 'audio/ogg'
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'audio/wav'
  if (at(4, 'ftyp')) return 'audio/mp4'
  if (at(0, 'ID3') || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return 'audio/mpeg'
  return ''
}

/** The blob with its audio type set, so every engine can play it. */
export async function typedAudio(blob: Blob): Promise<Blob> {
  if (blob.type) return blob
  const type = audioType(new Uint8Array(await blob.slice(0, 16).arrayBuffer()))
  return type ? new Blob([blob], { type }) : blob
}
