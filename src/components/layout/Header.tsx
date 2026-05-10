import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../lib/ThemeContext'
import { SegmentedControl } from './TabNav'
import { TAB_DESCS, type View } from './tabConfig'
import { FilterPanel } from '../features/FilterPanel'
import { PERIODS, DEFAULT_FILTER, SECTORS, type Period, type FilterState } from '../../types/filter'
import { searchStocksApi } from '../../lib/api'
import type { StockInfo } from '../../types/stock'

interface HeaderProps {
  currentView: View
  onViewChange: (view: View) => void
  period: Period
  onPeriodChange: (p: Period) => void
  filter: FilterState
  onFilterChange: (f: FilterState) => void
  onSearchSelect: (stock: StockInfo) => void
}

const PERIOD_DESCS: Record<Period, string> = {
  '1M': '直近1か月の相関を表示します。',
  '3M': '直近3か月の相関を表示します。',
  '6M': '直近6か月の相関を表示します。',
  '1Y': '直近1年の相関を表示します。',
  '3Y': '直近3年の相関を表示します。',
  '5Y': '直近5年の相関を表示します。',
}

function LogoIcon() {
  const { isDark } = useTheme()
  const fills = isDark
    ? ['#f5f5f7', '#98989d', '#48484a', '#98989d', '#f5f5f7', '#636366', '#48484a', '#636366', '#f5f5f7']
    : ['#1d1d1f', '#6e6e73', '#c7c7cc', '#6e6e73', '#1d1d1f', '#aeaeb2', '#c7c7cc', '#aeaeb2', '#1d1d1f']
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      {fills.map((fill, i) => (
        <rect key={i} x={(i % 3) * 7} y={Math.floor(i / 3) * 7} width="6" height="6" fill={fill} rx="1" />
      ))}
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <circle cx="7.5" cy="7.5" r="2.3" stroke="currentColor" strokeWidth="1.25" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const r = Math.PI * deg / 180
        return (
          <line
            key={deg}
            x1={7.5 + Math.cos(r) * 4}
            y1={7.5 + Math.sin(r) * 4}
            x2={7.5 + Math.cos(r) * 5.5}
            y2={7.5 + Math.sin(r) * 5.5}
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path
        d="M12.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Header({ currentView, onViewChange, period, onPeriodChange, filter, onFilterChange, onSearchSelect }: HeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StockInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [hoverInfo, setHoverInfo] = useState<{ desc: string; side: 'left' | 'right' } | null>(null)
  const { isDark, toggle } = useTheme()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchPanelRef = useRef<HTMLDivElement>(null)

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    setIsSearching(false)
  }, [])

  function updateSearchQuery(value: string) {
    setSearchQuery(value)
    if (!value.trim()) {
      setSearchResults([])
      setIsSearching(false)
    }
  }

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeSearch()
        setFilterOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeSearch])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchPanelRef.current && !searchPanelRef.current.contains(e.target as Node)) {
        closeSearch()
      }
    }
    if (searchOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [searchOpen, closeSearch])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) return
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await searchStocksApi(q)
        setSearchResults(results.slice(0, 8))
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const expanded = hovered || filterOpen
  const displayDesc = hoverInfo?.desc ?? TAB_DESCS[currentView]
  const showRight = hoverInfo?.side === 'right'
  const activeFilterCount =
    (filter.minCorr !== DEFAULT_FILTER.minCorr ? 1 : 0) +
    (filter.selectedSectors.length < SECTORS.length ? 1 : 0)
  const themeLabel = isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'

  return (
    <header
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setHoverInfo(null) }}
      className="absolute inset-x-0 top-0 bg-paper/90 backdrop-blur-2xl shadow-[0_1px_0_rgba(0,0,0,0.06)]"
      style={{
        height: expanded ? 64 : 32,
        transition: 'height 0.22s ease',
        backgroundColor: isDark ? 'rgba(30, 30, 32, 0.92)' : undefined,
      }}
    >
      <div className="absolute inset-x-0 top-0 h-8 flex items-center px-5 gap-4 overflow-hidden">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <LogoIcon />
            <span className="font-semibold text-[15px] tracking-[-0.3px] text-ink whitespace-nowrap">Kaburela</span>
          </div>
          <div className="w-px h-5 bg-border shrink-0" />
          <div className="min-w-0 overflow-x-auto">
            <SegmentedControl
              current={currentView}
              onChange={onViewChange}
              onHover={(desc) => setHoverInfo(desc ? { desc, side: 'left' } : null)}
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <div className="flex items-center">
            {PERIODS.map((p, idx) => {
              const visible = expanded || p === period
              return (
                <span
                  key={p}
                  style={{
                    display: 'inline-flex',
                    overflow: 'hidden',
                    maxWidth: visible ? 40 : 0,
                    marginRight: visible && idx < PERIODS.length - 1 ? 2 : 0,
                    transition: 'max-width 0.22s ease, margin 0.22s ease',
                  }}
                >
                  <button
                    onClick={() => onPeriodChange(p)}
                    onMouseEnter={() => setHoverInfo({ desc: PERIOD_DESCS[p], side: 'right' })}
                    onMouseLeave={() => setHoverInfo(null)}
                    className={cn(
                      'h-[28px] px-2 text-[13px] font-semibold transition-colors tabular-nums cursor-pointer select-none whitespace-nowrap shrink-0',
                      p === period ? 'text-ink' : 'text-muted hover:text-ink',
                    )}
                  >
                    {p}
                  </button>
                </span>
              )
            })}
          </div>

          <div className="w-px h-4 bg-border" />

          <div className="relative">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              onMouseEnter={() => setHoverInfo({ desc: '相関係数の下限と表示セクターを絞り込みます。', side: 'right' })}
              onMouseLeave={() => setHoverInfo(null)}
              className={cn(
                'h-[28px] px-3 text-[13px] font-semibold transition-colors cursor-pointer select-none whitespace-nowrap',
                filterOpen || activeFilterCount > 0 ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              フィルター
              {activeFilterCount > 0 && (
                <span className="ml-1.5 inline-flex w-4 h-4 rounded-full bg-ink text-paper text-[10px] font-bold items-center justify-center leading-none">
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

          <div className="relative" ref={searchPanelRef}>
            <button
              onClick={() => setSearchOpen(v => !v)}
              onMouseEnter={() => setHoverInfo({ desc: '銘柄コードまたは名前でチャートを開きます。', side: 'right' })}
              onMouseLeave={() => setHoverInfo(null)}
              aria-label="銘柄を検索"
              className={cn(
                'w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors cursor-pointer',
                searchOpen ? 'bg-ink text-paper' : 'text-muted hover:text-ink hover:bg-subtle',
              )}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {searchOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 w-80 bg-paper rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.06)] z-50 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                  {isSearching ? (
                    <div className="w-3 h-3 border border-border border-t-muted rounded-full animate-spin shrink-0" />
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
                      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => updateSearchQuery(e.target.value)}
                    placeholder="銘柄コード・名前で検索..."
                    className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => updateSearchQuery('')} className="text-muted hover:text-ink cursor-pointer shrink-0">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>

                {searchResults.length > 0 ? (
                  <div>
                    {searchResults.map(stock => (
                      <button
                        key={stock.code}
                        onClick={() => {
                          onSearchSelect(stock)
                          closeSearch()
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-subtle transition-colors cursor-pointer"
                      >
                        <span className="text-[11px] font-mono text-muted w-10 shrink-0">{stock.code}</span>
                        <span className="text-[13px] text-ink flex-1 truncate">{stock.name}</span>
                        <span className="text-[11px] font-mono text-muted shrink-0">{stock.label}</span>
                      </button>
                    ))}
                  </div>
                ) : searchQuery.trim() && !isSearching ? (
                  <p className="px-4 py-4 text-[12px] text-muted text-center">
                    「{searchQuery}」に一致する銘柄がありません
                  </p>
                ) : !searchQuery.trim() ? (
                  <p className="px-4 py-3 text-[11px] text-muted font-mono">
                    検索するとチャートビューで開きます
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <button
            onClick={toggle}
            onMouseEnter={() => setHoverInfo({ desc: themeLabel, side: 'right' })}
            onMouseLeave={() => setHoverInfo(null)}
            aria-label={themeLabel}
            className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted hover:text-ink hover:bg-subtle transition-colors cursor-pointer"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>

      <p
        className="absolute text-[12px] text-muted pointer-events-none whitespace-nowrap overflow-hidden text-ellipsis"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          marginTop: 16,
          ...(showRight ? { left: 20, right: 20, textAlign: 'right' } : { left: 88, right: 20 }),
          opacity: expanded ? 1 : 0,
          transition: 'opacity 0.18s ease',
        }}
      >
        {displayDesc}
      </p>
    </header>
  )
}
