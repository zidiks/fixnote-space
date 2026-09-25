/**
 * Where the ONNX runtime (for embeddings and Whisper) comes from. The desktop app and `pnpm dev`
 * ship it, so they work offline. The hosted web app loads the same version from jsDelivr: the file
 * is 26 MB, over the 25 MiB limit of Cloudflare's static hosting, and the web app needs the network
 * for its models anyway. Keep the version equal to the onnxruntime-web dependency (a test checks).
 */
export const ORT_VERSION = '1.31.0-dev.20260914-8d85527a0'

const CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`
const NAME = 'ort-wasm-simd-threaded.asyncify'

export async function ortPaths(): Promise<{ mjs: string; wasm: string }> {
  // Vite replaces these at build time, so the web build does not even emit the files.
  if (import.meta.env.DEV || import.meta.env.TAURI_ENV_PLATFORM) {
    const [mjs, wasm] = await Promise.all([
      import('onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'),
      import('onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'),
    ])
    return { mjs: mjs.default, wasm: wasm.default }
  }
  return { mjs: `${CDN}${NAME}.mjs`, wasm: `${CDN}${NAME}.wasm` }
}
