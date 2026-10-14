import { DurableObject } from 'cloudflare:workers'
import { CONSENT_TTL_MS, type ConsentResult } from '@fixnote/core/remote-mcp'
import { ConsentBox, type TakeResult } from './consent'

export interface HandoffEnv {
  CONSENT: DurableObjectNamespace<ConsentHandoff>
}

const KEY = 'r'

/**
 * One connect handoff, named by the OAuth authorization id (see consent.ts). SQLite-backed like
 * `UserRelay`, so it runs on the Workers Free plan; an alarm clears what nobody picked up.
 */
export class ConsentHandoff extends DurableObject<HandoffEnv> {
  private readonly box = new ConsentBox(
    {
      get: () => this.ctx.storage.get(KEY),
      put: (v) => this.ctx.storage.put(KEY, v),
      clear: async () => {
        await this.ctx.storage.deleteAlarm()
        await this.ctx.storage.deleteAll()
      },
    },
    Date.now,
  )

  async put(result: ConsentResult): Promise<'ok' | 'exists'> {
    const r = await this.box.put(result)
    if (r === 'ok') await this.ctx.storage.setAlarm(Date.now() + CONSENT_TTL_MS)
    return r
  }

  take(): Promise<TakeResult> {
    return this.box.take()
  }

  override async alarm() {
    await this.ctx.storage.deleteAll()
  }
}
