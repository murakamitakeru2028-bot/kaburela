import { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  valueDisplay?: string
}

export function Slider({ label, valueDisplay, className, ...props }: SliderProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || valueDisplay) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-[11px] text-muted">{label}</span>}
          {valueDisplay && (
            <span className="text-[11px] font-mono text-ink">{valueDisplay}</span>
          )}
        </div>
      )}
      <input
        type="range"
        className="w-full h-[3px] rounded-full appearance-none bg-border cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-[14px]
          [&::-webkit-slider-thumb]:h-[14px]
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-ink
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110"
        {...props}
      />
    </div>
  )
}
