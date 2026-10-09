import { type CollectionEntry, getCollection } from 'astro:content'
import { RIVALS, type Rival } from '../data/apps'
import { FEATURE_SLUGS, type FeatureSlug } from '../data/features'
import { isLang, LANGS, type Lang, localePath } from '../i18n'

export type Feature = CollectionEntry<'features'>
export type Vs = CollectionEntry<'vs'>

/** The language and slug of a feature or comparison page, from its path `<lang>/<slug>`. */
function split(id: string): { lang: Lang; slug: string } {
  const [lang, slug] = id.split('/')
  if (!isLang(lang) || !slug) throw new Error(`Page outside a language folder: ${id}`)
  return { lang, slug }
}

/**
 * Every feature page of one language in the order of src/data/features.ts. A slug missing in any
 * language, or a file with no slug in the list, fails the build: the pages must stay in step.
 */
export async function getFeatures(lang: Lang): Promise<{ slug: FeatureSlug; entry: Feature }[]> {
  const all = await getCollection('features')
  for (const l of LANGS) {
    const slugs = all.filter((e) => split(e.id).lang === l).map((e) => split(e.id).slug)
    const missing = FEATURE_SLUGS.filter((s) => !slugs.includes(s))
    const extra = slugs.filter((s) => !(FEATURE_SLUGS as string[]).includes(s))
    if (missing.length || extra.length)
      throw new Error(
        `Feature pages in ${l}: missing ${missing.join(', ')}; unknown ${extra.join(', ')}`,
      )
  }
  return FEATURE_SLUGS.map((slug) => {
    const entry = all.find((e) => e.id === `${lang}/${slug}`)
    if (!entry) throw new Error(`No feature page ${lang}/${slug}`)
    return { slug, entry }
  })
}

/** Every comparison page of one language, in the order of src/data/apps.ts. */
export async function getComparisons(lang: Lang): Promise<{ rival: Rival; entry: Vs }[]> {
  const all = await getCollection('vs')
  for (const l of LANGS) {
    const slugs = all.filter((e) => split(e.id).lang === l).map((e) => split(e.id).slug)
    const missing = RIVALS.filter((s) => !slugs.includes(s))
    if (missing.length) throw new Error(`Comparison pages in ${l}: missing ${missing.join(', ')}`)
  }
  return RIVALS.map((rival) => {
    const entry = all.find((e) => e.id === `${lang}/${rival}`)
    if (!entry) throw new Error(`No comparison page ${lang}/${rival}`)
    return { rival, entry }
  })
}

export const featurePath = (lang: Lang, slug: string): string =>
  localePath(lang, `/features/${slug}/`)
export const vsPath = (lang: Lang, rival: string): string => localePath(lang, `/vs/${rival}/`)

/** "{name}" and "{price}" in a sentence from the i18n files. */
export const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`)
