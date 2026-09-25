/** A database or RPC error from Supabase; they arrive as plain objects, not Error instances. */
export class ServerError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ServerError'
  }
}

/** Anything thrown or returned as an error, as an Error with a readable message. */
export function toError(err: unknown): Error {
  if (err instanceof Error) return err
  if (err && typeof err === 'object' && 'message' in err) {
    const { message, code } = err as { message: unknown; code?: unknown }
    return new ServerError(String(message), typeof code === 'string' ? code : undefined)
  }
  return new Error(String(err))
}

export const errorMessage = (err: unknown) => toError(err).message

/** The server lacks a table or function this build uses: its migrations were not applied. */
export function isServerOutdated(err: unknown): boolean {
  const e = toError(err)
  const code = e instanceof ServerError ? e.code : undefined
  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42883' ||
    /schema cache|does not exist/i.test(e.message)
  )
}
