import { heroRenderer } from './render'
import type { Copy } from './timeline'

/*
 * Plays the hero's app (HeroApp.astro) while it is on screen and the tab is visible; with reduced
 * motion it never starts, and the served page (the loop's first frame) stays. Nothing runs before
 * the fonts are in, so the text the script lays out is the text the page shows.
 *
 * `?hero-debug` adds `window.heroSeek(t)` for checking single frames.
 */
const root = document.querySelector<HTMLElement>('[data-hero-app]')
const data = document.getElementById('hero-app-copy')?.textContent
const still = matchMedia('(prefers-reduced-motion: reduce)')

if (root && data && !still.matches) {
  const copy = JSON.parse(data) as Copy
  document.fonts.ready.then(() => {
    const hero = heroRenderer(root, copy)
    let time = 0
    let last = 0
    let frame = 0
    let seen = false
    let held = false
    let drawn = -1
    // Typing and fades read fine at 30 frames a second, which halves the work; scrolling and the
    // block opening get every frame.
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      time = (time + dt) % hero.duration
      if (hero.smooth(time) || Math.abs(time - drawn) >= 1 / 31 || time < drawn) {
        hero.render(time)
        drawn = time
      }
      frame = requestAnimationFrame(tick)
    }
    const update = () => {
      const play = seen && !held && !document.hidden && !still.matches
      if (play && !frame) {
        last = 0
        frame = requestAnimationFrame(tick)
      } else if (!play && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    }
    new IntersectionObserver(
      (entries) => {
        seen = entries.some((e) => e.isIntersecting)
        update()
      },
      { threshold: 0.2 },
    ).observe(root)
    document.addEventListener('visibilitychange', update)
    still.addEventListener('change', update)

    if (new URLSearchParams(location.search).has('hero-debug')) {
      // Frames depend on the scroll history, so a seek replays the loop up to t at 30 fps.
      Object.assign(window, {
        heroSeek: (t: number) => {
          held = true
          update()
          hero.reset()
          for (let s = 0; s < t; s += 1 / 30) hero.render(s)
          hero.render(t)
          time = t
          return hero.duration
        },
        heroPlay: () => {
          held = false
          update()
        },
      })
    }
  })
}
