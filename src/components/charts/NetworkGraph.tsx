import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { fetchSectorIndices } from '../../lib/api'
import type { SectorData, SectorIndexMeta } from '../../lib/api'
import type { StockInfo } from '../../types/stock'
import type { Period } from '../../types/filter'

interface Props {
  stocks: StockInfo[]
  matrix: number[][]
  minCorr: number
  sectors?: SectorData[]
  period: Period
  onStockSelect: (stock: StockInfo) => void
}

interface XY {
  x: number
  y: number
}

const SECTOR_POSITIONS: Record<string, { cx: number; cy: number }> = {
  '電気機器': { cx: 0.22, cy: 0.23 },
  '輸送用機器': { cx: 0.49, cy: 0.18 },
  '銀行業': { cx: 0.78, cy: 0.24 },
  '情報・通信業': { cx: 0.18, cy: 0.48 },
  '医薬品': { cx: 0.40, cy: 0.47 },
  '化学': { cx: 0.62, cy: 0.47 },
  '食料品': { cx: 0.20, cy: 0.74 },
  '機械': { cx: 0.46, cy: 0.76 },
  '小売業': { cx: 0.33, cy: 0.88 },
  '不動産業': { cx: 0.76, cy: 0.68 },
  '電気・ガス業': { cx: 0.70, cy: 0.88 },
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function splitLabel(name: string): [string, string?] {
  if (name.length <= 5) return [name]
  const dot = name.indexOf('・')
  if (dot > 0 && dot < name.length - 1) return [name.slice(0, dot), name.slice(dot + 1)]
  const mid = Math.ceil(name.length / 2)
  return [name.slice(0, mid), name.slice(mid)]
}

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, size }
}

function sectorSubmatrix(
  sectorStocks: StockInfo[],
  allStocks: StockInfo[],
  fullMatrix: number[][],
): number[][] {
  const idx = sectorStocks.map(s => allStocks.findIndex(a => a.code === s.code))
  return idx.map((i, row) => idx.map((j, col) =>
    i >= 0 && j >= 0 ? fullMatrix[i][j] : (row === col ? 1 : 0)
  ))
}

function buildFallbackSectorMatrix(sectors: SectorData[], stocks: StockInfo[], matrix: number[][]): number[][] {
  return sectors.map((sectorA, i) =>
    sectors.map((sectorB, j) => {
      if (i === j) return 1
      const idxA = sectorA.stocks.map(s => stocks.findIndex(a => a.code === s.code)).filter(n => n >= 0)
      const idxB = sectorB.stocks.map(s => stocks.findIndex(a => a.code === s.code)).filter(n => n >= 0)
      let sum = 0
      let count = 0
      for (const a of idxA) {
        for (const b of idxB) {
          sum += matrix[a][b]
          count++
        }
      }
      return count ? sum / count : 0
    })
  )
}

function edgeKey(i: number, j: number): string {
  return `${i}-${j}`
}

function parseEdgeKey(key: string | null): { i: number; j: number } | null {
  if (!key) return null
  const [i, j] = key.split('-').map(Number)
  return Number.isFinite(i) && Number.isFinite(j) ? { i, j } : null
}

function SectorNetwork({
  sectors,
  sectorMatrix,
  minCorr,
  onSelect,
}: {
  sectors: SectorIndexMeta[]
  sectorMatrix: number[][]
  minCorr: number
  onSelect: (name: string) => void
}) {
  const { ref, size } = useElementSize()
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null)
  const { isDark } = useTheme()
  const N = sectors.length
  const nodeR = clamp(Math.min(size.w, size.h) * 0.065, 30, 54)
  const hitR = nodeR + 12

  const nodes = useMemo<XY[]>(() => {
    if (!size.w || !size.h) return []
    const margin = Math.max(hitR + 8, 64)
    return sectors.map((sector, i) => {
      const fixed = SECTOR_POSITIONS[sector.name]
      if (fixed) {
        return {
          x: clamp(fixed.cx * size.w, margin, size.w - margin),
          y: clamp(fixed.cy * size.h, margin, size.h - margin),
        }
      }
      const a = (2 * Math.PI * i) / N - Math.PI / 2
      return {
        x: size.w / 2 + size.w * 0.34 * Math.cos(a),
        y: size.h / 2 + size.h * 0.32 * Math.sin(a),
      }
    })
  }, [size, sectors, N, hitR])

  const edges = useMemo(() => {
    const result: { i: number; j: number; corr: number }[] = []
    const threshold = Math.max(minCorr, 0.18)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const c = sectorMatrix[i]?.[j] ?? 0
        if (Math.abs(c) >= threshold) result.push({ i, j, corr: c })
      }
    }
    return result
  }, [N, sectorMatrix, minCorr])

  const hoveredEdge = parseEdgeKey(hoveredEdgeKey)
  const edgeCorr = hoveredEdge ? sectorMatrix[hoveredEdge.i]?.[hoveredEdge.j] ?? 0 : null
  const nodeShadow = isDark
    ? 'drop-shadow(0 3px 8px rgba(0,0,0,0.46))'
    : 'drop-shadow(0 3px 8px rgba(0,0,0,0.14))'

  return (
    <div ref={ref} className="w-full h-full relative overflow-hidden">
      {size.w > 0 && (
        <svg width={size.w} height={size.h} style={{ display: 'block' }}>
          {edges.map(({ i, j, corr }) => {
            if (!nodes[i] || !nodes[j]) return null
            const abs = Math.abs(corr)
            const key = edgeKey(i, j)
            const active = hoveredNode === i || hoveredNode === j || hoveredEdgeKey === key
            return (
              <g key={key}>
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke={corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'}
                  strokeWidth={Math.max(1.2, abs * 7)}
                  strokeOpacity={active ? 0.82 : 0.10 + abs * 0.34}
                  strokeLinecap="round"
                  pointerEvents="none"
                  style={{ transition: 'stroke-opacity 0.12s ease' }}
                />
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke="transparent"
                  strokeWidth={18}
                  pointerEvents="stroke"
                  onMouseEnter={() => setHoveredEdgeKey(key)}
                  onMouseLeave={() => setHoveredEdgeKey(null)}
                />
              </g>
            )
          })}

          {sectors.map((sector, i) => {
            if (!nodes[i]) return null
            const active = hoveredNode === i
            const [line1, line2] = splitLabel(sector.name)
            const labelSize = line2 ? 13 : sector.name.length > 4 ? 14 : 16
            return (
              <g
                key={sector.name}
                transform={`translate(${nodes[i].x},${nodes[i].y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => {
                  setHoveredNode(i)
                  setHoveredEdgeKey(null)
                }}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onSelect(sector.name)}
              >
                <circle r={hitR} fill="transparent" pointerEvents="all" />
                <circle
                  r={active ? nodeR + 3 : nodeR}
                  fill="var(--color-paper)"
                  stroke={sector.color}
                  strokeWidth={active ? 3.2 : 2.2}
                  pointerEvents="none"
                  style={{
                    filter: nodeShadow,
                    transition: 'r 0.12s ease, stroke-width 0.12s ease',
                  }}
                />
                {line2 ? (
                  <>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} fontWeight={700} fill={sector.color} fontFamily="DM Sans, sans-serif" y={-11} pointerEvents="none">{line1}</text>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} fontWeight={700} fill={sector.color} fontFamily="DM Sans, sans-serif" y={4} pointerEvents="none">{line2}</text>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="var(--color-muted)" fontFamily="DM Mono, monospace" y={21} pointerEvents="none">{sector.stockCount} 銘柄</text>
                  </>
                ) : (
                  <>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} fontWeight={700} fill={sector.color} fontFamily="DM Sans, sans-serif" y={-6} pointerEvents="none">{line1}</text>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="var(--color-muted)" fontFamily="DM Mono, monospace" y={13} pointerEvents="none">{sector.stockCount} 銘柄</text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      )}

      <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none">
        {hoveredEdge && edgeCorr !== null ? (
          <div className="bg-paper/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-sm border border-border/50">
            <p className="text-[12px] font-mono">
              <span className="font-medium text-ink">{sectors[hoveredEdge.i]?.name}</span>
              <span className="text-muted mx-2">x</span>
              <span className="font-medium text-ink">{sectors[hoveredEdge.j]?.name}</span>
              <span className="text-muted mx-3">|</span>
              <span className="font-semibold" style={{ color: edgeCorr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                {edgeCorr >= 0 ? '+' : ''}{edgeCorr.toFixed(2)}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-muted font-mono">
            {hoveredNode !== null
              ? `${sectors[hoveredNode]?.name} をクリックして銘柄ネットワークへ`
              : 'セクターをクリックすると銘柄ネットワークに移動します'}
          </p>
        )}
      </div>
      <Legend />
    </div>
  )
}

function StockNetwork({
  stocks,
  matrix,
  minCorr,
  sector,
  onBack,
  onStockSelect,
}: {
  stocks: StockInfo[]
  matrix: number[][]
  minCorr: number
  sector?: SectorData
  onBack?: () => void
  onStockSelect: (stock: StockInfo) => void
}) {
  const { ref, size } = useElementSize()
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)
  const { isDark } = useTheme()
  const N = stocks.length
  const nodeR = clamp(Math.min(size.w, size.h) * 0.052, 22, 38)
  const hitR = nodeR + 10

  const nodes = useMemo<XY[]>(() => {
    if (!size.w || !size.h) return []
    const cx = size.w / 2
    const cy = size.h / 2 + 8
    const r = Math.max(90, Math.min(size.w * 0.35, size.h * 0.32))
    return stocks.map((_, i) => {
      const a = (2 * Math.PI * i) / Math.max(N, 1) - Math.PI / 2
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    })
  }, [size, stocks, N])

  const edges = useMemo(() => {
    const result: { i: number; j: number; corr: number }[] = []
    const threshold = Math.max(minCorr, 0)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const c = matrix[i]?.[j] ?? 0
        if (Math.abs(c) >= threshold) result.push({ i, j, corr: c })
      }
    }
    return result
  }, [N, matrix, minCorr])

  const hoveredEdge = parseEdgeKey(hoveredEdgeKey)
  const hoveredCorr = hoveredEdge ? matrix[hoveredEdge.i]?.[hoveredEdge.j] ?? 0 : null
  const hoveredStock = hoveredNode !== null ? stocks[hoveredNode] : null
  const nodeShadow = isDark
    ? 'drop-shadow(0 2px 7px rgba(0,0,0,0.48))'
    : 'drop-shadow(0 2px 6px rgba(0,0,0,0.12))'

  return (
    <div ref={ref} className="w-full h-full relative overflow-hidden">
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 sm:gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-muted hover:text-ink transition-colors text-[13px] bg-paper/85 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-sm border border-border cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            セクター一覧
          </button>
        )}
        {sector && (
          <div className="flex items-center gap-2 bg-paper/85 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-sm border border-border">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sector.color }} />
            <span className="text-[13px] font-semibold text-ink">{sector.name}</span>
            <span className="text-[11px] text-muted font-mono">{stocks.length} 銘柄</span>
          </div>
        )}
      </div>

      {size.w > 0 && (
        <svg width={size.w} height={size.h} style={{ display: 'block' }}>
          {edges.map(({ i, j, corr }) => {
            if (!nodes[i] || !nodes[j]) return null
            const abs = Math.abs(corr)
            const key = edgeKey(i, j)
            const active = hoveredEdgeKey === key || hoveredNode === i || hoveredNode === j
            return (
              <g key={key}>
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke={corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'}
                  strokeWidth={Math.max(1, abs * 6)}
                  strokeOpacity={active ? 0.9 : 0.14 + abs * 0.44}
                  strokeLinecap="round"
                  pointerEvents="none"
                  style={{ transition: 'stroke-opacity 0.12s ease' }}
                />
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke="transparent"
                  strokeWidth={18}
                  pointerEvents="stroke"
                  onMouseEnter={() => setHoveredEdgeKey(key)}
                  onMouseLeave={() => setHoveredEdgeKey(null)}
                />
              </g>
            )
          })}

          {stocks.map((stock, i) => {
            if (!nodes[i]) return null
            const active = hoveredNode === i
            return (
              <g
                key={stock.code}
                transform={`translate(${nodes[i].x},${nodes[i].y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => {
                  setHoveredNode(i)
                  setHoveredEdgeKey(null)
                }}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onStockSelect(stock)}
              >
                <circle r={hitR} fill="transparent" pointerEvents="all" />
                <circle
                  r={active ? nodeR + 2 : nodeR}
                  fill="var(--color-paper)"
                  stroke={sector?.color ?? 'var(--color-border)'}
                  strokeWidth={active ? 2.8 : 1.9}
                  pointerEvents="none"
                  style={{
                    filter: nodeShadow,
                    transition: 'r 0.12s ease, stroke-width 0.12s ease',
                  }}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={stock.label.length > 5 ? 9 : 11}
                  fill="var(--color-ink)"
                  fontFamily="DM Sans, sans-serif"
                  fontWeight={700}
                  pointerEvents="none"
                  style={{ userSelect: 'none' }}
                >
                  {stock.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {edges.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-[12px] text-muted font-mono">フィルターの相関係数下限を下げるとエッジが表示されます</p>
        </div>
      )}

      <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none">
        {hoveredEdge && hoveredCorr !== null ? (
          <div className="bg-paper/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-sm border border-border/50">
            <p className="text-[12px] font-mono">
              <span className="font-medium text-ink">{stocks[hoveredEdge.i].name}</span>
              <span className="text-muted mx-2">x</span>
              <span className="font-medium text-ink">{stocks[hoveredEdge.j].name}</span>
              <span className="text-muted mx-3">|</span>
              <span className="font-semibold" style={{ color: hoveredCorr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
                {hoveredCorr >= 0 ? '+' : ''}{hoveredCorr.toFixed(2)}
              </span>
            </p>
          </div>
        ) : hoveredStock ? (
          <div className="bg-paper/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-sm border border-border/50">
            <p className="text-[12px] font-mono">
              <span className="font-semibold text-ink">{hoveredStock.label}</span>
              <span className="text-muted mx-2">|</span>
              <span className="text-ink">{hoveredStock.name}</span>
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-muted font-mono">ノードをホバーすると接続を強調、エッジをホバーすると相関値を表示</p>
        )}
      </div>
      <Legend />
    </div>
  )
}

function Legend() {
  return (
    <div className="absolute bottom-3 left-3 right-3 flex flex-wrap justify-center gap-x-5 gap-y-1 pointer-events-none">
      <div className="flex items-center gap-1.5">
        <span className="w-5 h-[2px] rounded-full" style={{ backgroundColor: 'var(--color-pos)' }} />
        <span className="text-[10px] text-muted font-mono">正の相関</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-5 h-[2px] rounded-full" style={{ backgroundColor: 'var(--color-neg)' }} />
        <span className="text-[10px] text-muted font-mono">負の相関</span>
      </div>
      <span className="text-[10px] text-muted font-mono">線の太さ = 相関の強さ</span>
    </div>
  )
}

export function NetworkGraph({ stocks, matrix, minCorr, sectors, period, onStockSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [sectorIndexState, setSectorIndexState] = useState<{
    period: Period
    sectors: SectorIndexMeta[]
    matrix: number[][]
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSectorIndices(period)
      .then(data => {
        if (!cancelled) setSectorIndexState({ period, ...data })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [period])

  const fallbackSectorMeta = useMemo<SectorIndexMeta[]>(
    () => (sectors ?? []).map(s => ({ name: s.name, color: s.color, stockCount: s.stocks.length })),
    [sectors],
  )
  const fallbackMatrix = useMemo(
    () => sectors ? buildFallbackSectorMatrix(sectors, stocks, matrix) : [],
    [sectors, stocks, matrix],
  )

  const sectorIndexData = sectorIndexState?.period === period ? sectorIndexState : null
  const sectorMeta = sectorIndexData?.sectors ?? fallbackSectorMeta
  const sectorMatrix = sectorIndexData?.matrix ?? fallbackMatrix
  const selectedSector = selected ? sectors?.find(s => s.name === selected) : undefined

  if (selectedSector) {
    return (
      <StockNetwork
        stocks={selectedSector.stocks}
        matrix={sectorSubmatrix(selectedSector.stocks, stocks, matrix)}
        minCorr={minCorr}
        sector={selectedSector}
        onBack={() => setSelected(null)}
        onStockSelect={onStockSelect}
      />
    )
  }

  if (sectorMeta.length > 0 && sectorMatrix.length > 0) {
    return (
      <SectorNetwork
        sectors={sectorMeta}
        sectorMatrix={sectorMatrix}
        minCorr={minCorr}
        onSelect={setSelected}
      />
    )
  }

  return <StockNetwork stocks={stocks} matrix={matrix} minCorr={minCorr} onStockSelect={onStockSelect} />
}
