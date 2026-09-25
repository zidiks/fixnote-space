// Bundles the server into one CommonJS file (what Node's single-executable builder needs).
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// fileURLToPath, not URL.pathname: on Windows the latter gives "/D:/…", which esbuild rejects.
const path = (rel) => fileURLToPath(new URL(rel, import.meta.url))

await build({
  entryPoints: [path('../src/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: path('../dist/fixnote-mcp.cjs'),
  external: ['node:*'],
  legalComments: 'none',
  // node:sqlite prints an "experimental" warning on load; MCP clients show stderr as errors.
  banner: {
    js: "const __emit = process.emitWarning; process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : __emit.call(process, w, ...a));",
  },
  logLevel: 'warning',
})
console.log('dist/fixnote-mcp.cjs')
