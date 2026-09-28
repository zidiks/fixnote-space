import { subyApi } from '../_shared/suby.ts'
import { envFromDeno, handle } from './handler.ts'

const key = Deno.env.get('SUBY_API_KEY')
const suby = key ? subyApi(key) : null

Deno.serve((req) => handle(req, envFromDeno(), suby))
