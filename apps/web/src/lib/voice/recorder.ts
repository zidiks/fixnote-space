import { downsample, RATE, Segmenter } from './segments'

/** Longest recording we keep going; a dictated note, not a meeting. */
export const MAX_RECORDING_MS = 10 * 60_000

export class MicrophoneError extends Error {
  constructor(
    readonly reason: 'denied' | 'missing' | 'other',
    message: string,
  ) {
    super(message)
    this.name = 'MicrophoneError'
  }
}

/** The microphone, with the browser's echo and noise filtering; a MicrophoneError if it can't. */
export async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    throw new MicrophoneError(
      name === 'NotAllowedError' || name === 'SecurityError'
        ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'missing'
          : 'other',
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Records the microphone with MediaRecorder (Opus) and reports a 0..1 input level for the meter.
 * With `onPiece`, the recording is also cut at pauses as it goes (16 kHz, see `Segmenter`), so it
 * can be transcribed while the person speaks; stopping hands over the last piece before resolving.
 * The stream is released as soon as recording stops, so the OS "mic in use" indicator goes off.
 */
export class Recorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private audio: AudioContext | null = null
  private frame = 0
  private segmenter: Segmenter | null = null
  private onPiece: ((pcm: Float32Array) => void) | null = null

  async start(
    onLevel: (level: number) => void,
    onPiece?: (pcm: Float32Array) => void,
  ): Promise<void> {
    this.stream = await openMicrophone()
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    )
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data)
    }
    this.recorder.start(1000)

    const audio = new AudioContext()
    this.audio = audio
    const analyser = audio.createAnalyser()
    analyser.fftSize = 512
    const source = audio.createMediaStreamSource(this.stream)
    source.connect(analyser)
    if (onPiece) {
      const segmenter = new Segmenter()
      this.segmenter = segmenter
      this.onPiece = onPiece
      const node = audio.createScriptProcessor(4096, 1, 1)
      // It only runs when connected to the output: through a silent gain.
      const mute = audio.createGain()
      mute.gain.value = 0
      source.connect(node)
      node.connect(mute)
      mute.connect(audio.destination)
      node.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        let sum = 0
        for (const v of input) sum += v * v
        const pcm = downsample(new Float32Array(input), audio.sampleRate, RATE)
        const piece = segmenter.push(pcm, Math.sqrt(sum / input.length), audio.currentTime * 1000)
        if (piece) onPiece(piece)
      }
    }
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += ((v - 128) / 128) ** 2
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
      this.frame = requestAnimationFrame(tick)
    }
    tick()
  }

  /** Stops and returns the recording (the last piece goes to `onPiece` first). */
  stop(): Promise<Blob> {
    const rest = this.segmenter?.flush()
    if (rest) this.onPiece?.(rest)
    this.segmenter = null
    const rec = this.recorder
    if (!rec || rec.state === 'inactive') {
      this.release()
      return Promise.resolve(new Blob(this.chunks))
    }
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType })
        this.release()
        resolve(blob)
      }
      rec.stop()
    })
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.chunks = []
    this.segmenter = null
    this.release()
  }

  private release() {
    cancelAnimationFrame(this.frame)
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    void this.audio?.close()
    this.stream = null
    this.recorder = null
    this.audio = null
  }
}
