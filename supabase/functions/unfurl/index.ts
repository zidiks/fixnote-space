import { depsFromDeno, handle } from './handler.ts'

const deps = depsFromDeno()
Deno.serve((req) => handle(req, deps))
