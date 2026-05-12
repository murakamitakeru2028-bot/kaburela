import { useMemo, useState } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { corrToFill, corrToTextFill, hexToRgba } from '../../lib/colorUtils'
import type { MacroIndicator, MacroResponse, SectorData } from '../../lib/api'
import type { StockInfo } from '../../types/stock'

interface Props {
  data: MacroResponse
  sectors: SectorData[]
  onStockSelect: (stock: StockInfo) => void
}

interface SectorMeta {
  name: string
  color: string
}

interface RankedStock {
  stock: StockInfo
  corr: number
  sector?: SectorMeta
}

interface IndicatorRanking {
  indicator: MacroIndicator
  stocks: RankedStock[]
}

const TOP_STOCKS = 8

type MacroCategoryKey = 'all' | 'fx' | 'equity' | 'rates' | 'commodity' | 'semiconductor' | 'crypto'

const MACRO_CATEGORIES: { key: MacroCategoryKey; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'fx', label: '為替' },
  { key: 'equity', label: '株価指数' },
  { key: 'rates', label: '金利・ドル' },
  { key: 'commodity', label: '商品' },
  { key: 'semiconductor', label: '半導体' },
  { key: 'crypto', label: '暗号資産' },
]

const INDICATOR_CATEGORY: Record<string, Exclude<MacroCategoryKey, 'all'>> = {
  USDJPY: 'fx',
  EURJPY: 'fx',
  CNYJPY: 'fx',
  AUDJPY: 'fx',
  N225: 'equity',
  TOPIXETF: 'equity',
  GSPC: 'equity',
  DJI: 'equity',
  NASDAQ: 'equity',
  VIX: 'rates',
  US10Y: 'rates',
  DXY: 'rates',
  GOLD: 'commodity',
  SILVER: 'commodity',
  COPPER: 'commodity',
  OIL: 'commodity',
  NATGAS: 'commodity',
  BTCJPY: 'crypto',
  SOX: 'semiconductor',
  SOXX: 'semiconductor',
  SMH: 'semiconductor',
  NVDA: 'semiconductor',
  TSM: 'semiconductor',
  ASML: 'semiconductor',
  AMD: 'semiconductor',
  AVGO: 'semiconductor',
}

function buildSectorMap(sectors: SectorData[]): Map<string, SectorMeta> {
  const map = new Map<string, SectorMeta>()
  sectors.forEach(sec => {
    sec.stocks.forEach(st => map.set(st.code, { name: sec.name, color: sec.color }))
  })
  return map
}

function corrLabel(corr: number): string {
  return `${corr >= 0 ? '+' : ''}${corr.toFixed(2)}`
}

function corrTone(corr: number): string {
  if (corr >= 0.35) return '正相関'
  if (corr <= -0.35) return '逆相関'
  return '中立'
}

function categoryForIndicator(indicator: MacroIndicator): MacroCategoryKey {
  return INDICATOR_CATEGORY[indicator.code] ?? 'equity'
}

function StockCard({
  item,
  rank,
  isHovered,
  onHover,
  onStockSelect,
  isDark,
}: {
  item: RankedStock
  rank: number
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onStockSelect: (stock: StockInfo) => void
  isDark: boolean
}) {
  const abs = Math.abs(item.corr)
  const sectorColor = item.sector?.color ?? 'var(--color-border)'
  const fill = corrToFill(item.corr, isDark)
  const textFill = corrToTextFill(item.corr, isDark)

  return (
    <button
      type="button"
      onClick={() => onStockSelect(item.stock)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="min-h-[88px] rounded-xl border border-border bg-paper px-3 py-2.5 text-left cursor-pointer transition-[transform,border-color,box-shadow] duration-150"
      style={{
        borderColor: isHovered ? sectorColor : 'var(--color-border)',
        boxShadow: isHovered ? `0 8px 22px ${hexToRgba(sectorColor, isDark ? 0.26 : 0.18)}` : 'none',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted font-mono tabular-nums">#{rank}</span>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sectorColor }} />
            <span className="text-[11px] text-muted truncate">{item.sector?.name ?? '未分類'}</span>
          </div>
          <p className="mt-1 text-[13px] font-semibold text-ink truncate">{item.stock.label}</p>
          <p className="mt-0.5 text-[11px] text-muted truncate">{item.stock.name}</p>
        </div>
        <span className="shrink-0 text-[11px] text-muted font-mono tabular-nums">{item.stock.code}</span>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-6 w-[68px] rounded-lg flex items-center justify-center" style={{ backgroundColor: fill }}>
          <span className="text-[12px] font-semibold font-mono tabular-nums" style={{ color: textFill }}>
            {corrLabel(item.corr)}
          </span>
        </div>
        <div className="h-1.5 flex-1 rounded-full bg-subtle overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(8, abs * 100)}%`,
              backgroundColor: item.corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)',
            }}
          />
        </div>
        <span className="text-[10px] text-muted whitespace-nowrap">{corrTone(item.corr)}</span>
      </div>
    </button>
  )
}

function IndicatorRow({
  row,
  hoveredKey,
  setHoveredKey,
  onStockSelect,
  isDark,
}: {
  row: IndicatorRanking
  hoveredKey: string | null
  setHoveredKey: (key: string | null) => void
  onStockSelect: (stock: StockInfo) => void
  isDark: boolean
}) {
  const strongest = row.stocks[0]

  return (
    <section className="grid gap-4 border-b border-border py-4 first:pt-0 last:border-b-0 [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:190px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="lg:sticky lg:top-0 flex items-start gap-3">
          <span className="mt-1 h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: row.indicator.color }} />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink leading-tight">{row.indicator.name}</p>
            <p className="mt-1 text-[11px] text-muted font-mono">{row.indicator.label}</p>
            {strongest && (
              <p className="mt-3 text-[11px] text-muted leading-relaxed">
                最上位は <span className="font-semibold text-ink">{strongest.stock.label}</span>
                <span className="font-mono tabular-nums"> {corrLabel(strongest.corr)}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {row.stocks.map((item, index) => {
          const key = `${row.indicator.code}-${item.stock.code}`
          return (
            <StockCard
              key={key}
              item={item}
              rank={index + 1}
              isHovered={hoveredKey === key}
              onHover={(hovered) => setHoveredKey(hovered ? key : null)}
              onStockSelect={onStockSelect}
              isDark={isDark}
            />
          )
        })}
      </div>
    </section>
  )
}

export function MacroHeatmap({ data, sectors, onStockSelect }: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<MacroCategoryKey>('all')
  const { isDark } = useTheme()

  const rankings = useMemo<IndicatorRanking[]>(() => {
    const sectorMap = buildSectorMap(sectors)
    const visibleCodes = new Set(sectors.flatMap(sec => sec.stocks.map(stock => stock.code)))
    const shouldFilter = visibleCodes.size > 0

    return data.indicators.map((indicator, rowIndex) => {
      const row = data.matrix[rowIndex] ?? []
      const ranked = data.stocks
        .map((stock, colIndex) => ({
          stock,
          corr: row[colIndex] ?? 0,
          sector: sectorMap.get(stock.code),
        }))
        .filter(item => !shouldFilter || visibleCodes.has(item.stock.code))
        .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
        .slice(0, TOP_STOCKS)

      return { indicator, stocks: ranked }
    })
  }, [data, sectors])

  const categoryCounts = useMemo(() => {
    const counts = new Map<MacroCategoryKey, number>(MACRO_CATEGORIES.map(category => [category.key, 0]))
    rankings.forEach(row => {
      const category = categoryForIndicator(row.indicator)
      counts.set(category, (counts.get(category) ?? 0) + 1)
      counts.set('all', (counts.get('all') ?? 0) + 1)
    })
    return counts
  }, [rankings])

  const visibleRankings = useMemo(
    () => rankings.filter(row => activeCategory === 'all' || categoryForIndicator(row.indicator) === activeCategory),
    [rankings, activeCategory],
  )

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 px-3 pt-3 pb-3 sm:px-5 sm:pt-4 shrink-0">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink tracking-[-0.3px]">マクロ指標別 上位銘柄</h2>
          <p className="text-[11px] text-muted mt-0.5">為替、株価指数、商品、半導体などを切り替えて確認</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--color-neg)' }}>逆相関</span>
          <div
            className="w-20 sm:w-24 h-[6px] rounded-full"
            style={{
              background: `linear-gradient(to right, var(--color-neg) 0%, ${isDark ? '#2c2c2e' : '#f0f0f0'} 50%, var(--color-pos) 100%)`,
            }}
          />
          <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--color-pos)' }}>正相関</span>
        </div>
      </div>

      <div className="border-t border-border mx-3 sm:mx-5 shrink-0" />

      <div className="flex-1 overflow-auto px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center gap-2 pb-4">
          {MACRO_CATEGORIES.map(category => {
            const count = categoryCounts.get(category.key) ?? 0
            const selected = activeCategory === category.key
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => setActiveCategory(category.key)}
                disabled={count === 0}
                aria-pressed={selected}
                className={`h-8 rounded-[8px] border px-3 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  selected
                    ? 'border-ink bg-ink text-paper'
                    : 'border-border text-muted hover:text-ink hover:bg-subtle disabled:opacity-40 disabled:hover:bg-transparent'
                }`}
              >
                {category.label}
                <span className="ml-1.5 font-mono text-[10px] tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="grid gap-4 pb-2 [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:190px_minmax(0,1fr)]">
          <span className="text-[11px] text-muted font-mono">指標</span>
          <span className="hidden lg:inline text-[11px] text-muted font-mono">上位銘柄</span>
        </div>

        {visibleRankings.map(row => (
          <IndicatorRow
            key={row.indicator.code}
            row={row}
            hoveredKey={hoveredKey}
            setHoveredKey={setHoveredKey}
            onStockSelect={onStockSelect}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  )
}
