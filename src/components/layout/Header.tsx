import { useState } from 'react'
import { cn } from '../../lib/cn'
import type { View } from './TabNav'
import { SegmentedControl } from './TabNav'
import { FilterPanel } from '../features/FilterPanel'
import { PERIODS, DEFAULT_FILTER, SECTORS, type Period, type FilterState } from '../../types/filter'

interface HeaderProps {
  currentView: View
  onViewChange: (view: View) => void
  period: Period
  onPeriodChange: (p: Period) => void
  filter: FilterState
  onFilterChange: (f: FilterState) => void
}

function LogoIcon() {
  const fills = [
    '#1d1d1f', '#6e6e73', '#c7c7cc',
    '#6e6e73', '#1d1d1f', '#aeaeb2',
    '#c7c7cc', '#aeaeb2', '#1d1d1f',
  ]
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      {fills.map((fill, i) => (
        <rect key={i} x={(i % 3) * 7} y={Math.floor(i / 3) * 7} width="6" height="6" fill={fill} rx="1" />
      ))}
    </svg>
  )
}

export function Header({ currentView, onViewChange, period, onPeriodChange, filter, onFilterChange }: HeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false)

  /* デフォルトから変更されているフィルター数をバッジ表示 */
  const activeFilterCount =
    (filter.minCorr !== DEFAULT_FILTER.minCorr ? 1 : 0) +
    (filter.selectedSectors.length < SECTORS.length ? 1 : 0)

  return (
    <header className="sticky top-0 z-40 h-14 shrink-0 bg-paper/80 backdrop-blur-2xl flex items-center px-5 gap-4 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
      {/* 左: ロゴ + タブ */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <LogoIcon />
          <span className="font-semibold text-[15px] tracking-[-0.3px] text-ink">Kaburela</span>
        </div>
        <div className="w-px h-5 bg-border" />
        <SegmentedControl current={currentView} onChange={onViewChange} />
      </div>

      {/* 右: 期間選択 + フィルター */}
      <div className="ml-auto flex items-center gap-3 shrink-0">
        {/* 期間ボタン */}
        <div className="flex items-center gap-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={cn(
                'h-7 min-w-[32px] px-2 text-[12px] font-medium rounded-[7px] transition-colors tabular-nums cursor-pointer',
                period === p
                  ? 'bg-subtle text-ink'
                  : 'text-muted hover:bg-subtle hover:text-ink',
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* フィルターボタン */}
        <div className="relative">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={cn(
              'h-8 px-3 rounded-[10px] flex items-center gap-1.5 text-[12px] font-medium transition-colors cursor-pointer',
              filterOpen || activeFilterCount > 0
                ? 'bg-ink text-paper'
                : 'bg-subtle text-ink hover:bg-[#e0e0e5]',
            )}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1.5 3.5h10M3.5 6.5h6M5.5 9.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            フィルター
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-paper text-ink text-[10px] font-bold flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filterOpen && (
            <FilterPanel
              filter={filter}
              onChange={onFilterChange}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>
      </div>
    </header>
  )
}
