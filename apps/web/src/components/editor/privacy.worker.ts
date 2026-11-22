import { detectSecrets } from '@fixnote/core/privacy/detect'

self.addEventListener('message', (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data
  self.postMessage({ id, candidates: detectSecrets(text) })
})
