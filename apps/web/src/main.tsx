import '@fontsource-variable/inter'
import './styles.css'
import { parseShareLocation } from '@fixnote/core'
import { initI18n } from '@fixnote/i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

const root = document.getElementById('root')
if (!root) throw new Error('#root element missing')

await initI18n()

// A shared link (?s=<id>#<key>) opens a read-only page: no local database, no account.
const shared = parseShareLocation(location.search, location.hash)
// Back from paying in the desktop app (?billing=…&to=app), or from ListoPays' static return pages
// (?billing=…&via=card, the same for everyone): a page that sends to the app, not the app.
const params = new URLSearchParams(location.search)
const card = params.get('via') === 'card'
const billing = params.get('to') === 'app' || card ? params.get('billing') : null
// `?dev-backend`: the fake card payment page (lib/account/dev-plan.ts).
const devCard =
  import.meta.env.DEV && params.has('dev-backend') ? params.get('dev-card') || null : null
// An AI app asks to read the notes (Supabase Auth's OAuth consent step, docs/remote-mcp.md): a page
// that asks the FixNote app (fixnote://connect) or signs in for this tab only; not the app.
const consent = location.pathname === '/oauth/consent' ? params.get('authorization_id') || '' : null
const page = shared ? (
  await import('./components/SharePage').then(({ SharePage }) => (
    <SharePage id={shared.id} linkKey={shared.key} />
  ))
) : billing === 'success' || billing === 'cancel' ? (
  await import('./components/PaidPage').then(({ PaidPage }) => (
    <PaidPage result={billing} card={card} />
  ))
) : devCard ? (
  await import('./components/DevCardPage').then(({ DevCardPage }) => (
    <DevCardPage order={devCard} />
  ))
) : consent !== null ? (
  await import('./components/connect/ConnectPage').then(({ ConnectPage }) => (
    <ConnectPage authorizationId={consent} />
  ))
) : (
  <App />
)

createRoot(root).render(<StrictMode>{page}</StrictMode>)
