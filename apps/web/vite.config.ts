import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The same build is served in the browser and loaded by Tauri (apps/desktop).
// TAURI_ENV_* variables are set by the Tauri CLI when it runs this config.
const tauriPlatform = process.env.TAURI_ENV_PLATFORM
const tauriDebug = !!process.env.TAURI_ENV_DEBUG

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../..',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 (Windows) and WKWebView (macOS) are evergreen enough for es2022.
    target: tauriPlatform === 'windows' ? 'chrome110' : 'es2022',
    minify: tauriDebug ? false : 'oxc',
    sourcemap: tauriDebug,
  },
})
