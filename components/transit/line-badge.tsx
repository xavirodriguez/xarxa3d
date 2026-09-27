import type { Line } from '@/core/domain/network/model'
import { cn } from '@/lib/utils'

/** Line colors are data (official line identity), so they are applied inline rather than as theme tokens. */
export function LineBadge({ line, className }: { line: Line; className?: string }) {
  const lightBackground = line.color.toUpperCase() === '#F2B705'
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-8 items-center justify-center rounded-sm px-1.5 font-mono text-xs font-medium',
        lightBackground ? 'text-foreground' : 'text-card',
        className,
      )}
      style={{ backgroundColor: line.color }}
    >
      {line.code}
    </span>
  )
}
