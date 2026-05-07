import { cn } from '../../lib/cn'

export type View = 'home' | 'heatmap'

const TABS: { id: View; label: string }[] = [
  { id: 'home',    label: 'ホーム' },
  { id: 'heatmap', label: 'ヒートマップ' },
]

interface SegmentedControlProps {
  current: View
  onChange: (view: View) => void
}

export function SegmentedControl({ current, onChange }: SegmentedControlProps) {
  return (
    <div className="flex items-center bg-subtle rounded-[10px] p-[3px] gap-[2px]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'h-[28px] px-4 rounded-[8px] text-[13px] font-medium transition-all cursor-pointer select-none',
            current === tab.id
              ? 'bg-paper text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)]'
              : 'text-muted hover:text-ink',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
