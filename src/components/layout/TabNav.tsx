import { cn } from '../../lib/cn'
import { TABS, type View } from './tabConfig'

interface SegmentedControlProps {
  current: View
  onChange: (view: View) => void
}

export function SegmentedControl({ current, onChange }: SegmentedControlProps) {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'h-9 sm:h-[28px] px-2.5 sm:px-3 text-[12px] sm:text-[13px] font-semibold transition-colors cursor-pointer select-none whitespace-nowrap',
            current === tab.id ? 'text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
