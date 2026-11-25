import { refineRenderer } from './render'
import { type DiffPart, STILL_TIME } from './timeline'

/*
 * Plays the "Refine with AI" card loop (RefineCard.astro) while it is on screen
 * and the tab is visible. With reduced motion it renders the still suggested-edit
 * composition once fonts load. Waits for fonts before measuring character edges.
 *
 * `?refine-debug` adds `window.refineSeek(t)` and `window.refinePlay()`.
 */
const root = document.querySelector<HTMLElement>('[data-refine-card]')
const data = document.getElementById('refine-card-diff')?.textContent
const still = matchMedia('(prefers-reduced-motion: reduce)')

if (root && data) {
  const diff = JSON.parse(data) as DiffPart[]
  document.fonts.ready.then(() => {
    const card = refineRenderer(root, diff)
    let time = 0
    let last = 0
    let frame = 0
    let seen = false
    let held = false

    const renderCurrent = () => {
      if (still.matches) card.render(STILL_TIME, true)
      else card.render(time, false)
    }

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      time = (time + dt) % card.duration
      card.render(time, false)
      frame = requestAnimationFrame(tick)
    }

    const update = () => {
      if (still.matches) {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        card.render(STILL_TIME, true)
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
        card.measure()
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

    if (new URLSearchParams(location.search).has('refine-debug')) {
      Object.assign(window, {
        refineSeek: (t: number) => {
          held = true
          update()
          time = t
          card.render(t, false)
          return card.duration
        },
        refinePlay: () => {
          held = false
          update()
        },
      })
    }
  })
}
