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

/**
 * Records the microphone with MediaRecorder (Opus) and reports a 0..1 input level for the meter.
 * The stream is released as soon as recording stops, so the OS "mic in use" indicator goes off.
 */
export class Recorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private audio: AudioContext | null = null
  private frame = 0

  async start(onLevel: (level: number) => void): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
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
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    )
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data)
    }
    this.recorder.start(1000)

    this.audio = new AudioContext()
    const analyser = this.audio.createAnalyser()
    analyser.fftSize = 512
    this.audio.createMediaStreamSource(this.stream).connect(analyser)
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

  /** Stops and returns the recording. */
  stop(): Promise<Blob> {
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
