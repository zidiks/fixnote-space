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
// Back from paying in the desktop app (?billing=…&to=app): a page that opens the app, not the app.
const params = new URLSearchParams(location.search)
const billing = params.get('to') === 'app' ? params.get('billing') : null
const page = shared ? (
  await import('./components/SharePage').then(({ SharePage }) => (
    <SharePage id={shared.id} linkKey={shared.key} />
  ))
) : billing === 'success' || billing === 'cancel' ? (
  await import('./components/PaidPage').then(({ PaidPage }) => <PaidPage result={billing} />)
) : (
  <App />
)

createRoot(root).render(<StrictMode>{page}</StrictMode>)
