import { cn } from '@fixnote/ui'

/**
 * Stand-in for the Bloub avatar (github.com/jeremy-prt/bloub, MIT). Bloub's framework-free engine
 * gets ported in M3 with states mapped to assistant status; this keeps the slot and size.
 */
export function AssistantOrb({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 animate-[orb-breathe_4s_ease-in-out_infinite] rounded-[46%_54%_52%_48%/52%_46%_54%_48%] bg-foreground shadow-float" />
      <div className="absolute top-[38%] left-[34%] h-[18%] w-[9%] rounded-full bg-background" />
      <div className="absolute top-[38%] right-[34%] h-[18%] w-[9%] rounded-full bg-background" />
      <style>{`
        @keyframes orb-breathe {
          0%, 100% { transform: scale(1); border-radius: 46% 54% 52% 48% / 52% 46% 54% 48%; }
          50% { transform: scale(1.04); border-radius: 52% 48% 46% 54% / 48% 54% 46% 52%; }
        }
        @media (prefers-reduced-motion: reduce) { [class*="orb-breathe"] { animation: none; } }
      `}</style>
    </div>
  )
}
