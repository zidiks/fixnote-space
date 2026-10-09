import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

/**
 * Blog posts: src/content/blog/<lang>/<slug>.md. The folder sets the language and the file name
 * the URL; translations of one article share a `translationKey`, which links them with hreflang.
 */
const blog = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    translationKey: z.string(),
    draft: z.boolean().default(false),
    /** Questions answered at the end of the article, also given to search engines (FAQPage). */
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
})

const step = z.object({ title: z.string(), text: z.string() })
const qa = z.object({ q: z.string(), a: z.string() })

/**
 * A page per feature: src/content/features/<lang>/<slug>.md, one file per slug in every language
 * (src/data/features.ts lists the slugs). The Markdown body holds the longer sections.
 */
const features = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/features' }),
  schema: z.object({
    /** The page's headline. */
    title: z.string(),
    /** The <title>, written for search results. */
    metaTitle: z.string(),
    description: z.string(),
    eyebrow: z.string(),
    intro: z.string(),
    /** The feature on the features index and in "related" lists. */
    card: z.object({ title: z.string(), text: z.string() }),
    problem: z.string(),
    stepsTitle: z.string(),
    steps: z.array(step).min(3),
    privacy: z.string(),
    faq: z.array(qa).min(3),
  }),
})

/**
 * FixNote next to another app: src/content/vs/<lang>/<rival>.md (rivals in src/data/apps.ts). The
 * table comes from src/data/apps.ts; the Markdown body holds the longer sections.
 */
const vs = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/vs' }),
  schema: z.object({
    title: z.string(),
    metaTitle: z.string(),
    description: z.string(),
    intro: z.string(),
    steps: z.array(step).min(3),
    why: z.array(z.string()).min(3),
    still: z.array(z.string()).min(2),
    verdict: z.string(),
    faq: z.array(qa).min(3),
  }),
})

export const collections = { blog, features, vs }
