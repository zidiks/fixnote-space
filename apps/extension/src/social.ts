import type { Message } from './messages'
import { DEFAULT_SITES, parseSites, postOf, ruleFor, saveButton } from './sites'

/**
 * Content script on X, Reddit, YouTube and Instagram: when the person presses the site's own
 * Save / Bookmark, the post is saved to FixNote too, if they switched that site on in the
 * extension's options (off by default). Listens in the capture phase, so the site's own handler
 * changing the button afterwards does not matter; nothing on the page is changed.
 */

let enabled = false
let config = DEFAULT_SITES

async function load() {
  const [{ social }, { sites }] = await Promise.all([
    chrome.storage.sync.get('social'),
    chrome.storage.local.get('sites'),
  ])
  config = parseSites(sites) ?? DEFAULT_SITES
  const rule = ruleFor(config, location.hostname)
  enabled = Boolean(
    rule && social && typeof social === 'object' && (social as Record<string, boolean>)[rule.id],
  )
}

void load()
// Settings changed in the options page take effect without reloading the tab.
setInterval(() => void load(), 30_000)

let last = 0
document.addEventListener(
  'click',
  (e) => {
    if (!enabled || !(e.target instanceof Element)) return
    const rule = ruleFor(config, location.hostname)
    if (!rule) return
    const button = saveButton(rule, e.target)
    if (!button) return
    // One save per press (a double click, or a button inside a button).
    const now = Date.now()
    if (now - last < 800) return
    last = now
    const message: Message = {
      type: 'social-save',
      source: rule.id,
      post: postOf(rule, button, document),
    }
    void chrome.runtime.sendMessage(message)
  },
  true,
)
