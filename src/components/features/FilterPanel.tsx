import { useRef, useEffect } from 'react'
import { SECTORS, DEFAULT_FILTER, type FilterState } from '../../types/filter'
import { cn } from '../../lib/cn'

interface FilterPanelProps {
  filter: FilterState
  onChange: (f: FilterState) => void
  onClose: () => void
}

export function FilterPanel({ filter, onChange, onClose }: FilterPanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    /* mousedown で閉じると開くボタン自身のクリックと競合するため mouseup を使う */
    document.addEventListener('mouseup', handleClickOutside)
    return () => document.removeEventListener('mouseup', handleClickOutside)
  }, [onClose])

  const toggleSector = (sector: string) => {
    const next = filter.selectedSectors.includes(sector)
      ? filter.selectedSectors.filter((s) => s !== sector)
      : [...filter.selectedSectors, sector]
    onChange({ ...filter, selectedSectors: next })
  }

  const isDefault =
    filter.minCorr === DEFAULT_FILTER.minCorr &&
    filter.selectedSectors.length === SECTORS.length

  return (
    <div
      ref={ref}
      className="absolute top-[calc(100%+8px)] right-0 w-72 bg-paper rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] z-50 overflow-hidden"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f5]">
        <span className="text-[13px] font-semibold text-ink">フィルター</span>
        <button
          onClick={() => onChange({ ...DEFAULT_FILTER })}
          disabled={isDefault}
          className="text-[12px] text-[#0071e3] disabled:text-muted disabled:cursor-not-allowed transition-colors"
        >
          リセット
        </button>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {/* 相関係数の下限 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink">相関係数の下限</span>
            <span
              className={cn(
                'text-[12px] font-mono font-semibold tabular-nums',
                filter.minCorr >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]',
              )}
            >
              {filter.minCorr >= 0 ? '+' : ''}{filter.minCorr.toFixed(2)}
            </span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={-100}
              max={100}
              step={5}
              value={filter.minCorr * 100}
              onChange={(e) => onChange({ ...filter, minCorr: Number(e.target.value) / 100 })}
              className="w-full h-[3px] rounded-full appearance-none cursor-pointer bg-subtle
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-[16px]
                [&::-webkit-slider-thumb]:h-[16px]
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-paper
                [&::-webkit-slider-thumb]:shadow-[0_0_0_1.5px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.15)]
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:transition-transform
                [&::-webkit-slider-thumb]:hover:scale-110"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted font-mono">-1.00</span>
              <span className="text-[10px] text-muted font-mono">0</span>
              <span className="text-[10px] text-muted font-mono">+1.00</span>
            </div>
          </div>
        </div>

        {/* セクター */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink">セクター</span>
            <button
              onClick={() =>
                onChange({
                  ...filter,
                  selectedSectors:
                    filter.selectedSectors.length === SECTORS.length ? [] : [...SECTORS],
                })
              }
              className="text-[11px] text-[#0071e3]"
            >
              {filter.selectedSectors.length === SECTORS.length ? 'すべて解除' : 'すべて選択'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3">
            {SECTORS.map((sector) => {
              const checked = filter.selectedSectors.includes(sector)
              return (
                <label
                  key={sector}
                  className="flex items-center gap-2 cursor-pointer group"
                >
                  <div
                    onClick={() => toggleSector(sector)}
                    className={cn(
                      'w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors',
                      checked
                        ? 'bg-ink border-ink'
                        : 'bg-paper border-border group-hover:border-muted',
                    )}
                  >
                    {checked && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span
                    onClick={() => toggleSector(sector)}
                    className="text-[12px] text-ink leading-none select-none"
                  >
                    {sector}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
