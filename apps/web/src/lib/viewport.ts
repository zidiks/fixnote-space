import { useEffect } from 'react'

/**
 * Sizes the app to the visible part of the screen (the `.fx-vv #root` rule in styles.css). An
 * on-screen keyboard on iOS does not shrink the page, it covers it and pans; following
 * `visualViewport` keeps the input being typed in, and everything above it, on screen. While the
 * page is pinch-zoomed the app keeps its full size.
 */
export function useVisualViewport(enabled: boolean) {
  useEffect(() => {
    const vv = window.visualViewport
    if (!enabled || !vv) return
    const root = document.documentElement
    root.classList.add('fx-vv')
    const update = () => {
      if (Math.abs(vv.scale - 1) > 0.01) {
        root.style.removeProperty('--vv-height')
        root.style.removeProperty('--vv-top')
        return
      }
      root.style.setProperty('--vv-height', `${vv.height}px`)
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.classList.remove('fx-vv')
      root.style.removeProperty('--vv-height')
      root.style.removeProperty('--vv-top')
    }
  }, [enabled])
}
