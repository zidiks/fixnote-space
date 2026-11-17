import { DurableObject } from 'cloudflare:workers'
import type { RelayCall } from '@fixnote/core/remote-mcp/headless'
import { DemoRunner } from './demo-runner'
import type { ToolAnswer } from './hub'

/**
 * The demo device of an account AI-app reviewers use (OpenAI and Anthropic test a connector with a
 * demo account and expect it to answer at any time). Named by the account's user id and asked by
 * its `UserRelay` only when the account is in `DEMO_ACCOUNTS` and none of its real devices is
 * online. It holds demo notes (demo-notes.ts), never anyone's own: the one place the relay stores
 * note content, and only for these accounts.
 */
export class DemoDevice extends DurableObject {
  private readonly runner = new DemoRunner(this.ctx.storage.sql, {
    wipe: () => this.ctx.storage.deleteAll(),
  })

  run(call: RelayCall): Promise<ToolAnswer> {
    return this.runner.run(call)
  }
}
