import type { CSSProperties } from 'react'

/** Arcs of the brand colour, like the waves on the Pro card of the site. */
export const ART: CSSProperties = {
  background: [
    'radial-gradient(70% 120% at 104% -8%, color-mix(in oklch, var(--color-brand) 80%, black) 0 30%, transparent 31%)',
    'radial-gradient(85% 140% at 104% -8%, var(--color-brand) 0 43%, transparent 44%)',
    'radial-gradient(100% 160% at 104% -8%, color-mix(in oklch, var(--color-brand) 75%, white) 0 56%, transparent 57%)',
    'radial-gradient(118% 185% at 104% -8%, color-mix(in oklch, var(--color-brand) 45%, white) 0 69%, transparent 70%)',
    'color-mix(in oklch, var(--color-brand) 14%, var(--color-card))',
  ].join(', '),
}

/** What Pro gives, as listed in the offer and the welcome. */
export const PRO_BENEFITS = [
  'plan.promptSync',
  'plan.promptAi',
  'plan.promptShare',
  'plan.promptIntegrations',
  'plan.promptFiles',
  'plan.promptLink',
] as const
