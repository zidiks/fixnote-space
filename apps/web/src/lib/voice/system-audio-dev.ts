import type { SystemAudio } from '@fixnote/core'

/**
 * Development-only stand-in for the computer's sound (`?dev-backend`): the others "speak" for
 * three seconds, then pause for two, like a call. Pairs with the fake transcriber.
 */
export function devSystemAudio(): SystemAudio {
  let timer: ReturnType<typeof setInterval> | undefined
  return {
    supported: async () => true,
    async start(onAudio) {
      let t = 0
      timer = setInterval(() => {
        const talking = t % 5000 < 3000
        const pcm = new Float32Array(1600)
        if (talking) for (let i = 0; i < pcm.length; i++) pcm[i] = (Math.random() - 0.5) * 0.4
        onAudio(pcm)
        t += 100
      }, 100)
    },
    async stop() {
      clearInterval(timer)
    },
  }
}
