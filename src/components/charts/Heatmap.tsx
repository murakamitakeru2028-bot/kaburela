import { useState, useRef, useEffect } from 'react'
import type { HeatmapStock } from '../../data/mockCorrelation'

interface HeatmapProps {
  stocks: HeatmapStock[]
  matrix: number[][]
}

const LABEL_W = 84  /* 行ラベル幅 */
const LABEL_H = 72  /* 列ラベル高さ（回転テキスト用） */

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
}

/* 相関係数 → セル背景色 */
function corrToFill(corr: number): string {
  const base = [251, 251, 249] as const
  if (corr >= 0) {
    return `rgb(${lerp(base[0], 22, corr)},${lerp(base[1], 163, corr)},${lerp(base[2], 74, corr)})`
  }
  const t = -corr
  return `rgb(${lerp(base[0], 220, t)},${lerp(base[1], 38, t)},${lerp(base[2], 38, t)})`
}

/* セル内テキスト色（背景の明暗に応じて白 or 黒） */
function corrToTextFill(corr: number): string {
  return Math.abs(corr) > 0.52 ? 'rgba(255,255,255,0.92)' : 'rgba(29,29,31,0.72)'
}

export function Heatmap({ stocks, matrix }: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(640)
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null)

  /* コンテナ幅の変化を監視してセルサイズを動的計算 */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const N = stocks.length
  const CELL = Math.max(38, Math.min(72, Math.floor((containerW - LABEL_W - 64) / N)))
  const svgW = LABEL_W + N * CELL
  const svgH = LABEL_H + N * CELL

  const hoveredCorr = hovered ? matrix[hovered.row][hovered.col] : null

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-5 w-full px-8 py-8">

      {/* SVG ヒートマップ本体 */}
      <svg width={svgW} height={svgH} style={{ overflow: 'visible' }}>

        {/* 列ラベル（-45°回転） */}
        {stocks.map((s, col) => (
          <text
            key={col}
            transform={`translate(${LABEL_W + col * CELL + CELL / 2},${LABEL_H - 6}) rotate(-45)`}
            textAnchor="end"
            fontSize={11}
            fill="#6e6e73"
            fontFamily="DM Sans, sans-serif"
          >
            {s.label}
          </text>
        ))}

        {/* 行ラベル */}
        {stocks.map((s, row) => (
          <text
            key={row}
            x={LABEL_W - 10}
            y={LABEL_H + row * CELL + CELL / 2}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={11}
            fill={hovered?.row === row ? '#1d1d1f' : '#6e6e73'}
            fontFamily="DM Sans, sans-serif"
            style={{ transition: 'fill 0.1s' }}
          >
            {s.label}
          </text>
        ))}

        {/* 列ラベル（ホバー時に強調） */}
        {stocks.map((s, col) => (
          <text
            key={`col-hi-${col}`}
            transform={`translate(${LABEL_W + col * CELL + CELL / 2},${LABEL_H - 6}) rotate(-45)`}
            textAnchor="end"
            fontSize={11}
            fill={hovered?.col === col ? '#1d1d1f' : 'transparent'}
            fontFamily="DM Sans, sans-serif"
          >
            {s.label}
          </text>
        ))}

        {/* セル */}
        {matrix.map((rowData, row) =>
          rowData.map((corr, col) => (
            <g key={`${row}-${col}`}>
              <rect
                x={LABEL_W + col * CELL}
                y={LABEL_H + row * CELL}
                width={CELL}
                height={CELL}
                fill={corrToFill(corr)}
                onMouseEnter={() => setHovered({ row, col })}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'default' }}
              />
              {/* セル内の相関値（セルが十分大きい場合のみ表示） */}
              {CELL >= 48 && (
                <text
                  x={LABEL_W + col * CELL + CELL / 2}
                  y={LABEL_H + row * CELL + CELL / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.min(11, CELL * 0.2)}
                  fill={corrToTextFill(corr)}
                  fontFamily="DM Mono, monospace"
                  pointerEvents="none"
                >
                  {corr.toFixed(2)}
                </text>
              )}
            </g>
          ))
        )}

        {/* グリッド外枠 */}
        <rect
          x={LABEL_W}
          y={LABEL_H}
          width={N * CELL}
          height={N * CELL}
          fill="none"
          stroke="#d2d2d7"
          strokeWidth={1}
          pointerEvents="none"
        />

        {/* ホバーハイライト（列・行のクロスライン + セル枠） */}
        {hovered && (
          <>
            <rect
              x={LABEL_W + hovered.col * CELL}
              y={LABEL_H}
              width={CELL}
              height={N * CELL}
              fill="rgba(0,0,0,0.05)"
              pointerEvents="none"
            />
            <rect
              x={LABEL_W}
              y={LABEL_H + hovered.row * CELL}
              width={N * CELL}
              height={CELL}
              fill="rgba(0,0,0,0.05)"
              pointerEvents="none"
            />
            <rect
              x={LABEL_W + hovered.col * CELL}
              y={LABEL_H + hovered.row * CELL}
              width={CELL}
              height={CELL}
              fill="none"
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          </>
        )}
      </svg>

      {/* ホバー情報バー */}
      <div className="h-5 flex items-center">
        {hovered ? (
          <p className="text-[12px] font-mono">
            <span className="font-medium text-ink">{stocks[hovered.row].name}</span>
            <span className="text-muted mx-2">×</span>
            <span className="font-medium text-ink">{stocks[hovered.col].name}</span>
            <span className="text-muted mx-3">→</span>
            <span
              className="font-semibold"
              style={{ color: (hoveredCorr ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}
            >
              {(hoveredCorr ?? 0) >= 0 ? '+' : ''}{hoveredCorr?.toFixed(2)}
            </span>
          </p>
        ) : (
          <p className="text-[12px] text-muted font-mono">
            セルにカーソルを合わせると詳細が表示されます
          </p>
        )}
      </div>

      {/* カラースケール */}
      <div className="flex items-center gap-3" style={{ width: Math.min(260, svgW) }}>
        <span className="text-[11px] font-mono shrink-0" style={{ color: '#dc2626' }}>−1.00</span>
        <div
          className="flex-1 h-[6px] rounded-full"
          style={{ background: 'linear-gradient(to right, #dc2626 0%, #fbfbf9 50%, #16a34a 100%)' }}
        />
        <span className="text-[11px] font-mono shrink-0" style={{ color: '#16a34a' }}>+1.00</span>
      </div>

    </div>
  )
}
