import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../lib/utils'

/** A filter in a row of filters ("All", "Inbox", link topics): the picked one gets a border. */
export const chipVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3.5',
  {
    variants: {
      size: {
        sm: 'h-7.5 px-3 text-xs pointer-coarse:h-8',
        md: 'h-8.5 px-3.5 text-[13px]',
      },
      selected: {
        true: 'border-border text-foreground',
        false: 'border-transparent text-muted-foreground hover:text-foreground',
      },
    },
    defaultVariants: { size: 'sm', selected: false },
  },
)

export function Chip({
  className,
  size,
  selected,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof chipVariants>) {
  return (
    <button
      type="button"
      data-slot="chip"
      aria-pressed={Boolean(selected)}
      className={cn(chipVariants({ size, selected }), className)}
      {...props}
    />
  )
}
