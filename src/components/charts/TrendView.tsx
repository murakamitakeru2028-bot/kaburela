import { useEffect, useMemo, useRef, useState, type UIEvent, type WheelEvent } from 'react'
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

function modeLabel(mode: Mode): string {
  if (mode === 'stronger') return '強まった'
  if (mode === 'weaker') return '弱まった'
  if (mode === 'flip') return '符号反転'
  return 'すべて'
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
  const chromeRootRef = useRef<HTMLDivElement>(null)
  const chromeProgressRef = useRef(0)
  const chromeFrameRef = useRef<number | null>(null)
  const lastScrollTopRef = useRef(0)
  const [data, setData] = useState<{
    periods: TrendPeriods
    shortData: CorrelationResponse
    longData: CorrelationResponse
  } | null>(null)
  const [error, setError] = useState<{ periods: TrendPeriods; message: string } | null>(null)

  const trendPeriods = PERIOD_PAIR[period]

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

  useEffect(() => {
    return () => {
      if (chromeFrameRef.current != null) cancelAnimationFrame(chromeFrameRef.current)
    }
  }, [])

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

  function applyChromeProgress(progress: number) {
    const root = chromeRootRef.current
    if (!root) return
    const compact = window.innerWidth < 640
    const topHeight = compact ? 430 : 210
    const sectionHeight = compact ? 86 : 62
    root.style.setProperty('--chrome-top-height', `${Math.max(0, topHeight * (1 - progress))}px`)
    root.style.setProperty('--chrome-section-height', `${Math.max(0, sectionHeight * (1 - progress))}px`)
    root.style.setProperty('--chrome-opacity', String(1 - progress))
    root.style.setProperty('--chrome-shift', `${-8 * progress}px`)
  }

  function setChromeProgressDirect(nextProgress: number) {
    const progress = Math.max(0, Math.min(1, nextProgress))
    if (Math.abs(progress - chromeProgressRef.current) < 0.002) return
    chromeProgressRef.current = progress
    if (chromeFrameRef.current != null) return
    chromeFrameRef.current = requestAnimationFrame(() => {
      chromeFrameRef.current = null
      applyChromeProgress(chromeProgressRef.current)
    })
  }

  function handleListScroll(event: UIEvent<HTMLDivElement>) {
    const nextTop = event.currentTarget.scrollTop
    const delta = nextTop - lastScrollTopRef.current
    if (delta !== 0) {
      setChromeProgressDirect(nextTop <= 2 ? 0 : chromeProgressRef.current + delta / 160)
    }
    lastScrollTopRef.current = nextTop
  }

  function handleListWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.deltaY < 0) {
      setChromeProgressDirect(chromeProgressRef.current + event.deltaY / 160)
    }
  }

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

  const topChromeStyle = {
    maxHeight: 'var(--chrome-top-height, 430px)',
    opacity: 'var(--chrome-opacity, 1)',
    transform: 'translateY(var(--chrome-shift, 0px))',
  }
  const sectionHeaderStyle = {
    maxHeight: 'var(--chrome-section-height, 86px)',
    opacity: 'var(--chrome-opacity, 1)',
  }

  return (
    <div ref={chromeRootRef} className="h-full min-h-0 px-1.5 py-2 sm:px-4 sm:py-3 lg:px-6 flex flex-col gap-3">
      <div className="shrink-0 overflow-hidden transition-opacity duration-75" style={topChromeStyle}>
      <header className="flex items-start justify-between gap-5 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] text-muted font-mono tracking-[0.12em] uppercase">Trend</p>
          <h2 className="mt-1 text-[20px] sm:text-[24px] font-semibold text-ink tracking-[-0.6px]">相関トレンド</h2>
          <p className="mt-1 text-[12px] text-muted leading-relaxed max-w-3xl">
            短期の相関と長期の相関を比較して、最近つながりが強まった銘柄ペア、弱まった銘柄ペア、逆方向に変わったペアを検知します。
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
          <PeriodBadge label="短期" value={data.periods.short} />
          <span className="text-[12px] text-muted">vs</span>
          <PeriodBadge label="基準" value={data.periods.long} />
        </div>
      </header>

      <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 118px), 1fr))' }}>
        <Metric label="強まった" value={strongerCount.toLocaleString('ja-JP')} tone="pos" />
        <Metric label="弱まった" value={weakerCount.toLocaleString('ja-JP')} tone="neg" />
        <Metric label="符号反転" value={signFlipCount.toLocaleString('ja-JP')} />
        <Metric label="最大変化" value={deltaLabel(maxShift)} tone={maxShift >= 0 ? 'pos' : 'neg'} />
        <Metric label="表示条件" value={`±${threshold.toFixed(2)}以上`} />
      </div>

      <div className="mt-3 grid min-w-0 gap-2 min-[900px]:grid-cols-[minmax(220px,1fr)_auto_auto]">
        <label className="h-10 rounded-full bg-paper border border-border px-4 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="銘柄名・コードで検索"
            className="min-w-0 flex-1 bg-transparent outline-none text-[13px] text-ink placeholder:text-muted"
          />
        </label>

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

        <div className="min-w-0 h-10 rounded-full bg-paper border border-border px-3 sm:px-4 flex items-center gap-2 sm:gap-3">
          <span className="text-[11px] text-muted whitespace-nowrap">変化幅</span>
          <input
            type="range"
            min="0.05"
            max="0.5"
            step="0.05"
            value={threshold}
            onChange={event => setThreshold(Number(event.target.value))}
            className="min-w-[92px] flex-1 sm:w-28 accent-[var(--color-ink)]"
          />
          <span className="text-[12px] font-mono text-ink tabular-nums w-9">{threshold.toFixed(2)}</span>
        </div>
      </div>
      </div>

      <section className="min-h-0 flex-1 overflow-hidden flex flex-col">
        <div className="px-1 pb-2 flex flex-wrap items-end justify-between gap-3 sm:gap-4 shrink-0 overflow-hidden transition-opacity duration-75" style={sectionHeaderStyle}>
          <div className="min-w-0">
            <p className="text-[10px] text-muted font-mono tracking-[0.14em] uppercase">Pair Monitor</p>
            <h3 className="text-[15px] font-semibold text-ink">{modeLabel(mode)}ペア</h3>
            <p className="text-[11px] text-muted mt-0.5">
              {data.periods.long} から {data.periods.short} への相関変化を大きい順に表示
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <StatusPill label="表示" value={visiblePairs.length.toLocaleString('ja-JP')} />
            <StatusPill label="候補" value={filterPairs(allPairs, mode).length.toLocaleString('ja-JP')} />
          </div>
        </div>

        <div className="hidden lg:grid grid-cols-[56px_minmax(0,1fr)_100px_100px_160px_92px] gap-3 px-1 py-2.5 border-y border-border/70 text-[10px] text-muted font-mono tracking-[0.08em] uppercase shrink-0">
          <span>Rank</span>
          <span>Pair</span>
          <span>{data.periods.long}</span>
          <span>{data.periods.short}</span>
          <span>Shift</span>
          <span className="text-right">Delta</span>
        </div>

        {visiblePairs.length ? (
          <div className="min-h-0 overflow-auto" onScroll={handleListScroll} onWheel={handleListWheel}>
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
    <div className="h-10 px-4 rounded-full bg-paper border border-border flex items-center gap-2">
      <span className="text-[10px] text-muted font-mono uppercase tracking-[0.08em]">{label}</span>
      <span className="text-[13px] font-semibold text-ink tabular-nums">{value}</span>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? 'var(--color-pos)' : tone === 'neg' ? 'var(--color-neg)' : 'var(--color-ink)'
  return (
    <div className="border-t border-border pt-3">
      <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tabular-nums" style={{ color }}>{value}</p>
    </div>
  )
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="h-8 px-3 rounded-full bg-subtle flex items-center gap-2">
      <span className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase">{label}</span>
      <span className="text-[12px] text-ink font-semibold font-mono tabular-nums">{value}</span>
    </div>
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
    <div className="max-w-full h-10 flex items-center bg-subtle rounded-full p-1 gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'h-8 px-3 sm:px-4 rounded-full text-[12px] font-semibold transition-all cursor-pointer whitespace-nowrap',
            value === option.id
              ? 'bg-paper text-ink shadow-[0_1px_4px_rgba(0,0,0,0.12)]'
              : 'text-muted hover:text-ink',
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
