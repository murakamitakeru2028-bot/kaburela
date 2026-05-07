import { cn } from '../../lib/cn'

type Variant = 'default' | 'positive' | 'negative' | 'sector'

interface BadgeProps {
  variant?: Variant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-mono font-medium leading-none',
        variant === 'default' && 'bg-[#f0eeea] text-muted',
        variant === 'positive' && 'bg-[#dcfce7] text-[#16a34a]',
        variant === 'negative' && 'bg-[#fee2e2] text-[#dc2626]',
        variant === 'sector' && 'bg-[#f0eeea] text-ink border border-border',
        className,
      )}
    >
      {children}
    </span>
  )
}
