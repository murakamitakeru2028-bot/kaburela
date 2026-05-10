import { cn } from '../../lib/cn'
import { TABS, TAB_DESCS, type View } from './tabConfig'

interface SegmentedControlProps {
  current: View
  onChange: (view: View) => void
  onHover?: (desc: string | null) => void
}

export function SegmentedControl({ current, onChange, onHover }: SegmentedControlProps) {
  return (
    <div className="flex items-center gap-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          onMouseEnter={() => onHover?.(TAB_DESCS[tab.id])}
          onMouseLeave={() => onHover?.(null)}
          className={cn(
            'h-[28px] px-3 text-[13px] font-semibold transition-colors cursor-pointer select-none whitespace-nowrap',
            current === tab.id ? 'text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
