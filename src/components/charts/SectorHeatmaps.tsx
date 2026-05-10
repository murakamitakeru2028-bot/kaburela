import { useMemo, useState } from 'react'
import { MiniHeatmap } from './MiniHeatmap'
import { Heatmap } from './Heatmap'
import { hexToRgba } from '../../lib/colorUtils'
import type { SectorData } from '../../lib/api'
import type { StockInfo } from '../../types/stock'

interface Props {
  sectors: SectorData[]
  minCorr: number
  onStockSelect: (stock: StockInfo) => void
}

function avgAbsCorr(matrix: number[][]): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < matrix.length; i++)
    for (let j = i + 1; j < matrix.length; j++) {
      sum += Math.abs(matrix[i][j])
      count++
    }
  return count > 0 ? sum / count : 0
}

function topPair(stocks: SectorData['stocks'], matrix: number[][]): { stockA: StockInfo; stockB: StockInfo; corr: number } {
  let best = { i: 0, j: 1, corr: -Infinity }
  for (let i = 0; i < matrix.length; i++)
    for (let j = i + 1; j < matrix.length; j++)
      if (matrix[i][j] > best.corr) best = { i, j, corr: matrix[i][j] }
  return { stockA: stocks[best.i], stockB: stocks[best.j], corr: best.corr }
}

interface SectorCardProps {
  sector: SectorData
  minCorr: number
  index: number
  onClick: () => void
  onStockSelect: (stock: StockInfo) => void
}

function SectorCard({ sector, minCorr, index, onClick, onStockSelect }: SectorCardProps) {
  const avg = useMemo(() => avgAbsCorr(sector.matrix), [sector.matrix])
  const top = useMemo(() => topPair(sector.stocks, sector.matrix), [sector])

  return (
    <div
      onClick={onClick}
      className="bg-paper rounded-2xl overflow-hidden cursor-pointer shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]"
      style={{
        border: `1.5px solid ${hexToRgba(sector.color, 0.32)}`,
        animation: 'fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        animationDelay: `${index * 65}ms`,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.018)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
          <span className="text-[13px] font-semibold text-ink tracking-[-0.2px]">{sector.name}</span>
        </div>
        <span className="text-[11px] text-muted font-mono tabular-nums">{sector.stocks.length} 銘柄</span>
      </div>

      <div className="px-4 pb-3">
        <MiniHeatmap
          stocks={sector.stocks}
          matrix={sector.matrix}
          minCorr={minCorr}
          enterDelay={index * 65 + 120}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted font-mono">平均相関</span>
          <span className="text-[12px] font-semibold font-mono tabular-nums" style={{ color: 'var(--color-pos)' }}>
            +{avg.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted font-mono">最高</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStockSelect(top.stockA)
            }}
            className="text-[10px] text-muted hover:text-ink font-mono cursor-pointer truncate max-w-[72px]"
          >
            {top.stockA.label}
          </button>
          <span className="text-[10px] text-muted font-mono">×</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStockSelect(top.stockB)
            }}
            className="text-[10px] text-muted hover:text-ink font-mono cursor-pointer truncate max-w-[72px]"
          >
            {top.stockB.label}
          </button>
          <span className="text-[12px] font-semibold font-mono tabular-nums" style={{ color: 'var(--color-pos)' }}>
            +{top.corr.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}

interface DetailViewProps {
  sector: SectorData
  onBack: () => void
  onStockSelect: (stock: StockInfo) => void
}

function SectorDetailView({ sector, onBack, onStockSelect }: DetailViewProps) {
  const avg = useMemo(() => avgAbsCorr(sector.matrix), [sector.matrix])
  const top = useMemo(() => topPair(sector.stocks, sector.matrix), [sector.stocks, sector.matrix])

  return (
    <div
      className="h-full flex flex-col"
      style={{ animation: 'fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-muted hover:text-ink transition-colors cursor-pointer text-[13px]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            一覧に戻る
          </button>
          <span className="text-muted text-[13px]">/</span>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
            <span className="text-[15px] font-semibold text-ink tracking-[-0.3px]">{sector.name}</span>
            <span className="text-[12px] text-muted font-mono">{sector.stocks.length} 銘柄</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted font-mono">平均相関</span>
            <span className="text-[13px] font-semibold font-mono tabular-nums" style={{ color: 'var(--color-pos)' }}>
              +{avg.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted font-mono">最高ペア</span>
            <button
              type="button"
              onClick={() => onStockSelect(top.stockA)}
              className="text-[11px] text-muted hover:text-ink font-mono cursor-pointer"
            >
              {top.stockA.label}
            </button>
            <span className="text-[11px] text-muted font-mono">×</span>
            <button
              type="button"
              onClick={() => onStockSelect(top.stockB)}
              className="text-[11px] text-muted hover:text-ink font-mono cursor-pointer"
            >
              {top.stockB.label}
            </button>
            <span className="text-[13px] font-semibold font-mono tabular-nums" style={{ color: 'var(--color-pos)' }}>
              +{top.corr.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border mx-5 shrink-0" />

      <div className="flex-1 overflow-auto flex items-start justify-center">
        <Heatmap stocks={sector.stocks} matrix={sector.matrix} onStockSelect={onStockSelect} />
      </div>
    </div>
  )
}

export function SectorHeatmaps({ sectors, minCorr, onStockSelect }: Props) {
  const [selected, setSelected] = useState<SectorData | null>(null)

  if (selected) {
    return <SectorDetailView sector={selected} onBack={() => setSelected(null)} onStockSelect={onStockSelect} />
  }

  return (
    <div className="p-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {sectors.map((sector, i) => (
          <SectorCard
            key={sector.name}
            sector={sector}
            minCorr={minCorr}
            index={i}
            onClick={() => setSelected(sector)}
            onStockSelect={onStockSelect}
          />
        ))}
      </div>
    </div>
  )
}
