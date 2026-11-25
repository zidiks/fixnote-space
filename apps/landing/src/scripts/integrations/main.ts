import { onePromptAwayRenderer } from './render'
import type { OnePromptCopy } from './timeline'

/*
 * Plays the "Your notes, one prompt away." scene (OnePromptAway.astro) while it
 * is on screen and the tab is visible. With reduced motion it shows the final
 * composition once fonts load. Waits for fonts before measuring text layout.
 *
 * `?integ-debug` adds `window.integSeek(t)` and `window.integPlay()`.
 */
const root = document.querySelector<HTMLElement>('[data-one-prompt-away]')
const data = document.getElementById('one-prompt-away-copy')?.textContent
const still = matchMedia('(prefers-reduced-motion: reduce)')

if (root && data) {
  const copy = JSON.parse(data) as OnePromptCopy
  document.fonts.ready.then(() => {
    const scene = onePromptAwayRenderer(root, copy)
    let time = 0
    let last = 0
    let frame = 0
    let seen = false
    let held = false

    const renderCurrent = () => {
      if (still.matches) scene.render(scene.stillTime, true)
      else scene.render(time, false)
    }

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      time = (time + dt) % scene.duration
      scene.render(time, false)
      frame = requestAnimationFrame(tick)
    }

    const update = () => {
      if (still.matches) {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        scene.render(scene.stillTime, true)
        return
      }
      const play = seen && !held && !document.hidden
      if (play && !frame) {
        last = 0
        frame = requestAnimationFrame(tick)
      } else if (!play && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    }

    renderCurrent()

    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        scene.measure()
        renderCurrent()
      }).observe(root.parentElement ?? root)
    }

    new IntersectionObserver(
      (entries) => {
        seen = entries.some((e) => e.isIntersecting)
        update()
      },
      { threshold: 0.15 },
    ).observe(root.parentElement ?? root)

    document.addEventListener('visibilitychange', update)
    still.addEventListener('change', update)

    if (new URLSearchParams(location.search).has('integ-debug')) {
      Object.assign(window, {
        integSeek: (t: number) => {
          held = true
          update()
          time = t
          scene.render(t, false)
          return scene.duration
        },
        integPlay: () => {
          held = false
          update()
        },
      })
    }
  })
}
