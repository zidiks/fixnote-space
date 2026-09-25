import { existsSync } from 'node:fs'
import { MIGRATIONS } from '@fixnote/core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { defaultDatabasePath } from './paths'
import { createServer } from './server'
import { openNodeSqlite } from './sqlite'

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const path = argValue('--db') ?? defaultDatabasePath()
  if (!existsSync(path)) {
    process.stderr.write(
      `FixNote database not found at ${path}. Open the FixNote app once first.\n`,
    )
    process.exit(1)
  }
  const db = openNodeSqlite(path)
  const [row] = await db.query<{ user_version: number }>('PRAGMA user_version')
  const version = Number(row?.user_version ?? 0)
  if (version !== MIGRATIONS.length) {
    process.stderr.write(
      `FixNote database is at schema v${version}, this server expects v${MIGRATIONS.length}. Update and open the FixNote app.\n`,
    )
    process.exit(1)
  }

  await createServer(db).connect(new StdioServerTransport())
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`)
  process.exit(1)
})
