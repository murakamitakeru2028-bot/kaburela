import { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'solid' | 'ghost' | 'outline'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  active?: boolean
}

export function Button({
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors rounded-[8px] cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' && 'h-7 px-2.5 text-[12px]',
        size === 'md' && 'h-8 px-3.5 text-[13px]',
        variant === 'solid' && 'bg-ink text-paper hover:opacity-80',
        variant === 'ghost' && !active && 'text-muted hover:text-ink hover:bg-[#f0eeea]',
        variant === 'ghost' && active && 'text-ink bg-[#f0eeea]',
        variant === 'outline' && !active && 'border border-border text-ink hover:bg-[#f0eeea]',
        variant === 'outline' && active && 'border border-ink text-ink bg-[#f0eeea]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
