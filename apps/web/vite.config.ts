import { existsSync, readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Hosted builds (Cloudflare) have no .env: use the public values of .env.example unless the
// environment sets them. Variables set by the host still win.
const root = new URL('../../', import.meta.url)
if (!existsSync(new URL('.env', root))) {
  for (const line of readFileSync(new URL('.env.example', root), 'utf8').split('\n')) {
    const m = line.match(/^(VITE_\w+)=(.*)$/)
    if (m?.[1] && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
}

// The same build is served in the browser and loaded by Tauri (apps/desktop).
// TAURI_ENV_* variables are set by the Tauri CLI when it runs this config.
const tauriPlatform = process.env.TAURI_ENV_PLATFORM
const tauriDebug = !!process.env.TAURI_ENV_DEBUG

/**
 * The hosted web app loads the 26 MB ONNX runtime from a CDN (see packages/platform-web/src/ort.ts):
 * Cloudflare serves files up to 25 MiB. onnxruntime-web still references its own copy as a
 * fallback that is never used once the paths are set, so the web build leaves the file out.
 */
function dropBundledOrt(): Plugin {
  return {
    name: 'fixnote:drop-bundled-ort',
    apply: 'build',
    generateBundle(_, bundle) {
      if (tauriPlatform) return
      for (const name of Object.keys(bundle)) {
        if (/ort-wasm-simd-threaded\.asyncify-[\w-]+\.wasm$/.test(name)) delete bundle[name]
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dropBundledOrt()],
  envDir: '../..',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  // sqlite-wasm locates its .wasm via import.meta.url; pre-bundling would break that.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es', plugins: () => [dropBundledOrt()] },
  build: {
    // WebView2 (Windows) and WKWebView (macOS) are evergreen enough for es2022.
    target: tauriPlatform === 'windows' ? 'chrome110' : 'es2022',
    minify: tauriDebug ? false : 'oxc',
    sourcemap: tauriDebug,
  },
})
