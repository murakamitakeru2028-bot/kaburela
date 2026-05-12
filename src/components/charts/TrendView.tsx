import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { fetchCorrelation, type CorrelationResponse, type SectorData } from '../../lib/api'
import type { Period } from '../../types/filter'
import type { StockInfo } from '../../types/stock'

interface Props {
  period: Period
  sectors: SectorData[]
  minCorr: number
  onStockSelect: (stock: StockInfo) => void
}

type Mode = 'all' | 'stronger' | 'weaker' | 'flip'

interface TrendPair {
  stockA: StockInfo
  stockB: StockInfo
  shortCorr: number
  longCorr: number
  delta: number
}

interface TrendPeriods {
  short: Period
  long: Period
}

const PERIOD_PAIR: Record<Period, TrendPeriods> = {
  '1M': { short: '1M', long: '6M' },
  '3M': { short: '3M', long: '1Y' },
  '6M': { short: '6M', long: '3Y' },
  '1Y': { short: '1Y', long: '5Y' },
  '3Y': { short: '1Y', long: '3Y' },
  '5Y': { short: '1Y', long: '5Y' },
}

function corrLabel(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

function deltaLabel(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

function deltaColor(value: number): string {
  if (value > 0) return 'var(--color-pos)'
  if (value < 0) return 'var(--color-neg)'
  return 'var(--color-muted)'
}


function signFlip(shortCorr: number, longCorr: number): boolean {
  return Math.sign(shortCorr) !== Math.sign(longCorr) && Math.abs(shortCorr) >= 0.2 && Math.abs(longCorr) >= 0.2
}

function buildTrendPairs(
  shortData: CorrelationResponse,
  longData: CorrelationResponse,
  visibleCodes: Set<string>,
  minCorr: number,
): TrendPair[] {
  const longIndex = new Map(longData.stocks.map((stock, index) => [stock.code, index]))
  const pairs: TrendPair[] = []

  for (let i = 0; i < shortData.stocks.length; i++) {
    const stockA = shortData.stocks[i]
    if (!visibleCodes.has(stockA.code)) continue
    const longI = longIndex.get(stockA.code)
    if (longI == null) continue

    for (let j = i + 1; j < shortData.stocks.length; j++) {
      const stockB = shortData.stocks[j]
      if (!visibleCodes.has(stockB.code)) continue
      const longJ = longIndex.get(stockB.code)
      if (longJ == null) continue

      const shortCorr = shortData.matrix[i]?.[j]
      const longCorr = longData.matrix[longI]?.[longJ]
      if (shortCorr == null || longCorr == null) continue
      if (Math.max(Math.abs(shortCorr), Math.abs(longCorr)) < minCorr) continue

      pairs.push({
        stockA,
        stockB,
        shortCorr,
        longCorr,
        delta: shortCorr - longCorr,
      })
    }
  }

  return pairs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

function filterPairs(pairs: TrendPair[], mode: Mode): TrendPair[] {
  if (mode === 'stronger') return pairs.filter(pair => pair.delta > 0)
  if (mode === 'weaker') return pairs.filter(pair => pair.delta < 0)
  if (mode === 'flip') return pairs.filter(pair => signFlip(pair.shortCorr, pair.longCorr))
  return pairs
}

export function TrendView({ period, sectors, minCorr, onStockSelect }: Props) {
  const [mode, setMode] = useState<Mode>('all')
  const [threshold, setThreshold] = useState(0.15)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<{
    periods: TrendPeriods
    shortData: CorrelationResponse
    longData: CorrelationResponse
  } | null>(null)
  const [error, setError] = useState<{ periods: TrendPeriods; message: string } | null>(null)

  const trendPeriods = PERIOD_PAIR[period]

  function openSearch() {
    setSearchOpen(true)
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([fetchCorrelation(trendPeriods.short), fetchCorrelation(trendPeriods.long)])
      .then(([shortData, longData]) => {
        if (cancelled) return
        setData({ periods: trendPeriods, shortData, longData })
        setError(null)
      })
      .catch((err: Error) => {
        if (!cancelled) setError({ periods: trendPeriods, message: err.message })
      })

    return () => { cancelled = true }
  }, [trendPeriods])

  const visibleCodes = useMemo(
    () => new Set(sectors.flatMap(sector => sector.stocks.map(stock => stock.code))),
    [sectors],
  )

  const allPairs = useMemo(() => {
    if (!data) return []
    return buildTrendPairs(data.shortData, data.longData, visibleCodes, minCorr)
  }, [data, visibleCodes, minCorr])

  const normalizedQuery = query.trim().toLowerCase()
  const visiblePairs = useMemo(() => {
    const base = filterPairs(allPairs, mode)
      .filter(pair => Math.abs(pair.delta) >= threshold)
    if (!normalizedQuery) return base.slice(0, 80)
    return base.filter(pair =>
      [pair.stockA, pair.stockB].some(stock =>
        [stock.code, stock.name, stock.label].some(value => value.toLowerCase().includes(normalizedQuery)),
      ),
    ).slice(0, 80)
  }, [allPairs, mode, threshold, normalizedQuery])

  const signFlipCount = allPairs.filter(pair => signFlip(pair.shortCorr, pair.longCorr)).length
  const strongerCount = allPairs.filter(pair => pair.delta >= threshold).length
  const weakerCount = allPairs.filter(pair => pair.delta <= -threshold).length
  const maxShift = allPairs[0]?.delta ?? 0

  const hasCurrentData = data?.periods.short === trendPeriods.short && data.periods.long === trendPeriods.long
  const currentError = error?.periods.short === trendPeriods.short && error.periods.long === trendPeriods.long ? error.message : null

  if (currentError) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[13px] text-muted">トレンドデータを読み込めませんでした: {currentError}</p>
      </div>
    )
  }

  if (!data || !hasCurrentData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-border border-t-muted animate-spin" />
          <p className="text-[13px] text-muted">相関トレンドを計算中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 px-1.5 py-2 sm:px-4 sm:py-3 lg:px-6 flex flex-col gap-2">
      <header className="shrink-0 flex flex-col gap-1 border-b border-border/70 pb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="shrink-0 flex flex-col justify-center mr-1">
            <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase leading-none">Kaburela</p>
            <h2 className="text-[15px] font-semibold text-ink tracking-tight leading-tight">相関トレンド</h2>
          </div>
          <span className="w-px h-8 bg-border shrink-0" />
          <SegmentedSwitch
            options={[
              { id: 'all', label: 'すべて' },
              { id: 'stronger', label: '強まった' },
              { id: 'weaker', label: '弱まった' },
              { id: 'flip', label: '反転' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <span className="w-px h-4 bg-border shrink-0" />
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted whitespace-nowrap">変化幅</span>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.05"
              value={threshold}
              onChange={event => setThreshold(Number(event.target.value))}
              className="min-w-[80px] w-24 accent-[var(--color-ink)]"
            />
            <span className="text-[12px] font-mono text-ink tabular-nums w-9">{threshold.toFixed(2)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <PeriodBadge label="短期" value={data.periods.short} />
            <span className="text-[12px] text-muted">vs</span>
            <PeriodBadge label="基準" value={data.periods.long} />
            {searchOpen ? (
              <label className="h-8 rounded-full bg-paper border border-border px-3 flex items-center gap-1.5 w-[180px] sm:w-[220px]">
                <svg width="12" height="12" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="銘柄名・コードで検索"
                  className="min-w-0 flex-1 bg-transparent outline-none text-[12px] text-ink placeholder:text-muted"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  className="text-muted hover:text-ink cursor-pointer shrink-0 p-0.5"
                  aria-label="検索を閉じる"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </label>
            ) : (
              <button
                type="button"
                onClick={openSearch}
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center cursor-pointer transition-colors',
                  query ? 'bg-subtle text-ink' : 'text-muted hover:bg-subtle hover:text-ink',
                )}
                aria-label="検索"
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden>
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatLine label="強化" value={strongerCount.toLocaleString('ja-JP')} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="弱化" value={weakerCount.toLocaleString('ja-JP')} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="反転" value={signFlipCount.toLocaleString('ja-JP')} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="最大" value={deltaLabel(maxShift)} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="条件" value={`±${threshold.toFixed(2)}`} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="表示" value={visiblePairs.length.toLocaleString('ja-JP')} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="候補" value={filterPairs(allPairs, mode).length.toLocaleString('ja-JP')} />
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden flex flex-col">

        <div className="hidden lg:grid grid-cols-[56px_minmax(0,1fr)_100px_100px_160px_92px] gap-3 px-1 py-2.5 border-y border-border/70 text-[10px] text-muted font-mono tracking-[0.08em] uppercase shrink-0">
          <span>Rank</span>
          <span>Pair</span>
          <span>{data.periods.long}</span>
          <span>{data.periods.short}</span>
          <span>Shift</span>
          <span className="text-right">Delta</span>
        </div>

        {visiblePairs.length ? (
          <div className="min-h-0 overflow-auto">
            {visiblePairs.map((pair, index) => (
              <TrendRow
                key={`${pair.stockA.code}-${pair.stockB.code}`}
                rank={index + 1}
                pair={pair}
                onStockSelect={onStockSelect}
              />
            ))}
          </div>
        ) : (
          <div className="min-h-[260px] flex items-center justify-center">
            <p className="text-[12px] text-muted">条件に一致するトレンドがありません。変化幅を下げるか、フィルターを調整してください。</p>
          </div>
        )}
      </section>
    </div>
  )
}

function PeriodBadge({ label, value }: { label: string; value: Period }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted font-mono uppercase tracking-[0.08em]">{label}</span>
      <span className="text-[12px] font-semibold font-mono tabular-nums text-ink">{value}</span>
    </span>
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase">{label}</span>
      <span className="text-[12px] font-semibold font-mono tabular-nums text-ink">{value}</span>
    </span>
  )
}


function SegmentedSwitch<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'h-7 px-2.5 text-[12px] font-medium transition-all cursor-pointer whitespace-nowrap border-b-2',
            value === option.id
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink/70',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function TrendRow({
  rank,
  pair,
  onStockSelect,
}: {
  rank: number
  pair: TrendPair
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <div className="group relative grid grid-cols-[34px_minmax(0,1fr)] min-[520px]:grid-cols-[40px_minmax(0,1fr)_76px] lg:grid-cols-[56px_minmax(0,1fr)_100px_100px_160px_92px] gap-x-2 gap-y-1 sm:gap-x-3 items-center border-b border-border/60 px-1 py-3 sm:py-3.5 transition-colors hover:bg-subtle/55">
      <span
        className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
        style={{ backgroundColor: deltaColor(pair.delta), opacity: rank <= 3 ? 0.95 : 0.5 }}
      />
      <RankNumber rank={rank} />
      <StockPair stockA={pair.stockA} stockB={pair.stockB} onStockSelect={onStockSelect} />
      <CorrValue value={pair.longCorr} className="hidden lg:block" />
      <CorrValue value={pair.shortCorr} className="hidden lg:block" />
      <ShiftBar delta={pair.delta} className="hidden lg:flex" />
      <DeltaBadge delta={pair.delta} />
    </div>
  )
}

function RankNumber({ rank }: { rank: number }) {
  const strong = rank <= 3
  return (
    <span
      className={cn(
        'justify-self-end h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center font-mono tabular-nums shrink-0 border',
        strong
          ? 'text-[13px] font-semibold text-ink bg-paper border-muted/40 shadow-[0_4px_12px_rgba(0,0,0,0.08)]'
          : 'text-[11px] text-muted bg-transparent border-border',
      )}
    >
      {rank.toString().padStart(2, '0')}
    </span>
  )
}

function StockPair({
  stockA,
  stockB,
  onStockSelect,
}: {
  stockA: StockInfo
  stockB: StockInfo
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <div className="min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
      <StockButton stock={stockA} align="right" onStockSelect={onStockSelect} />
      <span className="h-px w-3 sm:w-5 bg-border" />
      <StockButton stock={stockB} align="left" onStockSelect={onStockSelect} />
    </div>
  )
}

function StockButton({
  stock,
  align,
  onStockSelect,
}: {
  stock: StockInfo
  align: 'left' | 'right'
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onStockSelect(stock)}
      className={cn(
        'min-w-0 cursor-pointer rounded-lg px-1.5 sm:px-2 py-1 transition-colors hover:bg-paper',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      title={`${stock.name} (${stock.code})`}
    >
      <span className="block truncate text-[12px] sm:text-[13px] font-semibold text-ink">{stock.label}</span>
      <span className="block truncate text-[10px] text-muted font-mono tabular-nums">{stock.code}</span>
    </button>
  )
}

function CorrValue({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn('h-8 px-2.5 rounded-full bg-paper border border-border inline-flex items-center text-[12px] font-mono font-semibold tabular-nums', className)}
      style={{ color: value >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
    >
      {corrLabel(value)}
    </span>
  )
}

function ShiftBar({ delta, className }: { delta: number; className?: string }) {
  return (
    <div className={cn('items-center gap-2', className)}>
      <span className="w-12 text-[10px] text-muted">{delta >= 0 ? '強化' : '弱化'}</span>
      <div className="h-2 flex-1 rounded-full bg-paper border border-border overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(8, Math.min(100, Math.abs(delta) * 160))}%`,
            backgroundColor: deltaColor(delta),
            opacity: 0.8,
          }}
        />
      </div>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  return (
    <span
      className="col-start-2 justify-self-start min-[520px]:col-auto min-[520px]:justify-self-end h-8 min-w-[70px] px-2 rounded-full flex items-center justify-center text-[13px] font-semibold font-mono tabular-nums"
      style={{
        color: deltaColor(delta),
        backgroundColor: delta >= 0 ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
        border: `1px solid ${delta >= 0 ? 'rgba(22, 163, 74, 0.22)' : 'rgba(220, 38, 38, 0.22)'}`,
      }}
    >
      {deltaLabel(delta)}
    </span>
  )
}
