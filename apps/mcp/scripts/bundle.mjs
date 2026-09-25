// Bundles the server into one CommonJS file (what Node's single-executable builder needs).
import { build } from 'esbuild'

await build({
  entryPoints: [new URL('../src/main.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: new URL('../dist/fixnote-mcp.cjs', import.meta.url).pathname,
  external: ['node:*'],
  legalComments: 'none',
  // node:sqlite prints an "experimental" warning on load; MCP clients show stderr as errors.
  banner: {
    js: "const __emit = process.emitWarning; process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : __emit.call(process, w, ...a));",
  },
  logLevel: 'warning',
})
console.log('dist/fixnote-mcp.cjs')
