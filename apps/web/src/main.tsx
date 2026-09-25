import '@fontsource-variable/inter'
import './styles.css'
import { initI18n } from '@fixnote/i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

const root = document.getElementById('root')
if (!root) throw new Error('#root element missing')

await initI18n()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
