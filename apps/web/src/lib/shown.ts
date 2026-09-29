import { platform } from './platform'

let done = false

/**
 * Shows the desktop window once what is on screen is worth seeing (the app, or an error), after
 * the browser has painted it; before that it stays hidden, so it never opens blank or in the
 * wrong theme. Also shown after a moment whatever happens (and by Rust after 3 s).
 */
export function appShown() {
  if (done) return
  done = true
  requestAnimationFrame(() => requestAnimationFrame(() => platform.shown?.()))
}

setTimeout(appShown, 1500)
