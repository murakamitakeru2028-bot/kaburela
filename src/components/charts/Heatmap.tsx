import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { corrToFill, corrToTextFill } from '../../lib/colorUtils'
import type { StockInfo } from '../../types/stock'

interface HeatmapProps {
  stocks: StockInfo[]
  matrix: number[][]
  onStockSelect?: (stock: StockInfo) => void
}

const GAP = 4
const CELL_R = 7
const LABEL_W = 80
const COL_LABEL_H = 32

export function Heatmap({ stocks, matrix, onStockSelect }: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(640)
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const N = stocks.length
  const availableW = Math.max(0, containerW - 16)
  const CELL = Math.max(24, Math.min(68, Math.floor((availableW - LABEL_W - GAP * (N - 1)) / N)))
  const svgW = LABEL_W + N * CELL + GAP * (N - 1)
  const svgH = N * CELL + GAP * (N - 1)
  const center = (N - 1) / 2

  function cellDelay(row: number, col: number): number {
    const dist = Math.abs(row - center) + Math.abs(col - center)
    return Math.round(dist * 30)
  }

  const hoveredCorr = hovered ? matrix[hovered.row][hovered.col] : null

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-0 w-full px-2 py-3">
      {containerW > 0 && (
        <>
          <div
            style={{
              marginLeft: LABEL_W,
              height: COL_LABEL_H,
              display: 'flex',
              alignItems: 'flex-end',
              gap: GAP,
              paddingBottom: 6,
            }}
          >
            {stocks.map((s, col) => (
              <button
                type="button"
                key={col}
                onClick={() => onStockSelect?.(s)}
                onMouseEnter={() => setHovered({ row: col, col })}
                onMouseLeave={() => setHovered(null)}
                style={{
                  width: CELL,
                  flexShrink: 0,
                  textAlign: 'center',
                  fontSize: 10,
                  fontFamily: 'DM Sans, sans-serif',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: hovered?.col === col ? 'var(--color-ink)' : 'var(--color-muted)',
                  fontWeight: hovered?.col === col ? 600 : 400,
                  transition: 'color 0.15s',
                  cursor: onStockSelect ? 'pointer' : 'default',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <svg width={svgW} height={svgH} style={{ overflow: 'visible' }}>
            {stocks.map((s, row) => (
              <text
                key={row}
                x={LABEL_W - 10}
                y={row * (CELL + GAP) + CELL / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                onClick={() => onStockSelect?.(s)}
                onMouseEnter={() => setHovered({ row, col: row })}
                onMouseLeave={() => setHovered(null)}
                style={{
                  fill: hovered?.row === row ? 'var(--color-ink)' : 'var(--color-muted)',
                  transition: 'fill 0.15s',
                  fontWeight: hovered?.row === row ? 600 : 400,
                  cursor: onStockSelect ? 'pointer' : 'default',
                }}
                fontFamily="DM Sans, sans-serif"
              >
                {s.label}
              </text>
            ))}

            {matrix.map((rowData, row) =>
              rowData.map((corr, col) => {
                const cx = LABEL_W + col * (CELL + GAP)
                const cy = row * (CELL + GAP)
                const isHov = hovered?.row === row && hovered?.col === col
                const isRowOrCol = hovered ? hovered.row === row || hovered.col === col : false
                return (
                  <g
                    key={`${row}-${col}`}
                    style={{
                      animation: 'cell-in 0.28s ease both',
                      animationDelay: `${cellDelay(row, col)}ms`,
                    }}
                  >
                    <rect
                      x={cx}
                      y={cy}
                      width={CELL}
                      height={CELL}
                      rx={CELL_R}
                      fill={row === col ? (isDark ? '#2c2c2e' : '#e8e8e8') : corrToFill(corr, isDark)}
                      stroke={isHov ? 'var(--color-ink)' : 'transparent'}
                      strokeWidth={isHov ? 1.8 : 0}
                      onMouseEnter={() => { if (row !== col) setHovered({ row, col }) }}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        opacity: hovered && !isRowOrCol ? 0.55 : (row === col ? 0.5 : 1),
                        transition: 'opacity 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease, filter 0.15s ease',
                        cursor: 'default',
                        filter: isHov ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.18))' : 'none',
                      } as React.CSSProperties}
                    />
                    {row === col ? (
                      <line
                        x1={cx + 8}
                        y1={cy + 8}
                        x2={cx + CELL - 8}
                        y2={cy + CELL - 8}
                        stroke="var(--color-border)"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                    ) : CELL >= 44 && (
                      <text
                        x={cx + CELL / 2}
                        y={cy + CELL / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.min(11, CELL * 0.19)}
                        fill={corrToTextFill(corr, isDark)}
                        fontFamily="DM Mono, monospace"
                        pointerEvents="none"
                        style={{
                          opacity: hovered && !isRowOrCol ? 0.45 : 1,
                          fontWeight: isHov ? 700 : 400,
                          transition: 'opacity 0.15s ease',
                        }}
                      >
                        {corr.toFixed(2)}
                      </text>
                    )}
                  </g>
                )
              })
            )}
          </svg>
        </>
      )}

      <div
        className="w-full max-w-md h-9 flex items-center justify-center rounded-xl px-4 mt-5"
        style={{
          background: hovered
            ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)')
            : 'transparent',
          transition: 'background 0.2s',
          alignSelf: 'center',
        }}
      >
        {hovered && hovered.row !== hovered.col ? (
          <p className="min-w-0 text-[12px] font-mono flex items-center gap-2">
            <span className="font-semibold text-ink">{stocks[hovered.row].name}</span>
            <span className="text-muted text-[10px]">×</span>
            <span className="font-semibold text-ink">{stocks[hovered.col].name}</span>
            <span className="text-border mx-1">|</span>
            <span
              className="font-bold text-[14px] tabular-nums"
              style={{ color: (hoveredCorr ?? 0) >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
            >
              {(hoveredCorr ?? 0) >= 0 ? '+' : ''}{hoveredCorr?.toFixed(2)}
            </span>
          </p>
        ) : (
          <p className="text-[12px] text-muted font-mono" style={{ alignSelf: 'center' }}>
            セルをホバーして詳細を確認
          </p>
        )}
      </div>

      <div
        className="flex items-center gap-3 mt-2"
        style={{ width: Math.min(280, svgW), alignSelf: 'center' }}
      >
        <span className="text-[11px] font-mono tabular-nums shrink-0" style={{ color: 'var(--color-neg)' }}>-1.00</span>
        <div className="relative flex-1 h-[6px] rounded-full overflow-hidden">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `linear-gradient(to right, var(--color-neg) 0%, ${isDark ? '#2c2c2e' : '#f0f0f0'} 50%, var(--color-pos) 100%)`,
            }}
          />
        </div>
        <span className="text-[11px] font-mono tabular-nums shrink-0" style={{ color: 'var(--color-pos)' }}>+1.00</span>
      </div>
    </div>
  )
}
