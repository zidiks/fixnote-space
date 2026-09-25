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
  }),
})

export const collections = { blog }
