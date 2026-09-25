import { envFromDeno, handle } from './handler.ts'

Deno.serve((req) => handle(req, envFromDeno()))
