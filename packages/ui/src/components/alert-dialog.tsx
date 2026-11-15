import { AlertDialog as Primitive } from 'radix-ui'
import type * as React from 'react'
import { useRef } from 'react'
import { buttonVariants } from './button'

/**
 * Small confirm dialog. Works the same in browsers and Tauri, unlike window.confirm.
 * `focusConfirm`: the confirm button starts focused, so Enter confirms (by default Cancel does).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive,
  focusConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  destructive?: boolean
  focusConfirm?: boolean
}) {
  const action = useRef<HTMLButtonElement>(null)
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-scrim animate-in fade-in-0" />
        <Primitive.Content
          onOpenAutoFocus={(e) => {
            if (!focusConfirm) return
            e.preventDefault()
            action.current?.focus()
          }}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover p-6 text-popover-foreground shadow-float animate-in fade-in-0 zoom-in-95"
        >
          <Primitive.Title className="text-lg font-semibold">{title}</Primitive.Title>
          {description ? (
            <Primitive.Description className="mt-1 text-sm text-muted-foreground">
              {description}
            </Primitive.Description>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Primitive.Cancel className={buttonVariants({ variant: 'outline' })}>
              {cancelLabel}
            </Primitive.Cancel>
            <Primitive.Action
              ref={action}
              onClick={onConfirm}
              className={buttonVariants({ variant: destructive ? 'destructive' : 'default' })}
            >
              {confirmLabel}
            </Primitive.Action>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
