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
    <section className="grid gap-4 border-b border-border py-4 first:pt-0 last:border-b-0" style={{ gridTemplateColumns: '176px minmax(0, 1fr)' }}>
      <div className="min-w-0">
        <div className="sticky top-0 flex items-start gap-3">
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

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-3 shrink-0">
        <div>
          <h2 className="text-[15px] font-semibold text-ink tracking-[-0.3px]">マクロ指標別 上位銘柄</h2>
          <p className="text-[11px] text-muted mt-0.5">各指標と相関が強い銘柄を絶対値順で表示</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--color-neg)' }}>逆相関</span>
          <div
            className="w-24 h-[6px] rounded-full"
            style={{
              background: `linear-gradient(to right, var(--color-neg) 0%, ${isDark ? '#2c2c2e' : '#f0f0f0'} 50%, var(--color-pos) 100%)`,
            }}
          />
          <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--color-pos)' }}>正相関</span>
        </div>
      </div>

      <div className="border-t border-border mx-5 shrink-0" />

      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="grid gap-4 pb-2" style={{ gridTemplateColumns: '176px minmax(0, 1fr)' }}>
          <span className="text-[11px] text-muted font-mono">指標</span>
          <span className="text-[11px] text-muted font-mono">上位銘柄</span>
        </div>

        {rankings.map(row => (
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
