import type { ImageMetadata } from 'astro'
import type { Lang } from '../i18n'

/**
 * The home page's app pictures, one per language: src/assets/landing/<name>-<en|es>.png, rendered
 * from Figma by tools/figma-bridge/fixnote/landing-shots.mjs. Languages without their own
 * pictures get the English ones.
 */
const pictures = import.meta.glob<{ default: ImageMetadata }>('../assets/landing/*-{en,es}.png', {
  eager: true,
})

export function landingShot(name: string, lang: Lang): ImageMetadata {
  const own = pictures[`../assets/landing/${name}-${lang}.png`]
  const picture = own ?? pictures[`../assets/landing/${name}-en.png`]
  if (!picture) throw new Error(`No picture ${name}-en.png in src/assets/landing`)
  return picture.default
}
