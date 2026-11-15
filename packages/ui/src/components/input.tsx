import type * as React from 'react'
import { cn } from '../lib/utils'

/** `sm`: 13px text and a lower box, for inputs inside menus, bars and dense settings rows. */
export function Input({
  className,
  type,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & { size?: 'default' | 'sm' }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex w-full min-w-0 rounded-sm border border-input bg-card px-3 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50',
        size === 'sm' ? 'h-9 text-[13px]' : 'h-10 text-sm',
        className,
      )}
      {...props}
    />
  )
}
