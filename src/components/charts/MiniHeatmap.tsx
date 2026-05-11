import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { corrToFill, corrToTextFill } from '../../lib/colorUtils'
import type { StockInfo } from '../../types/stock'

interface Props {
  stocks: StockInfo[]
  matrix: number[][]
  minCorr: number
  enterDelay?: number
}

const GAP = 3
const LABEL_W = 56
const LABEL_H = 22
const CELL_R = 5

export function MiniHeatmap({ stocks, matrix, minCorr, enterDelay = 0 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)
  const [hov, setHov] = useState<{ row: number; col: number } | null>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const N = stocks.length
  const CELL = containerW > 0
    ? Math.max(24, Math.floor((containerW - LABEL_W - 16 - GAP * (N - 1)) / N))
    : 40
  const svgW = LABEL_W + N * CELL + GAP * (N - 1)
  const svgH = LABEL_H + N * CELL + GAP * (N - 1)

  const center = (N - 1) / 2
  function cellDelay(row: number, col: number): number {
    const dist = Math.abs(row - center) + Math.abs(col - center)
    return enterDelay + Math.round(dist * 45)
  }

  const tooltipInfo = hov ? {
    cx: LABEL_W + hov.col * (CELL + GAP) + CELL / 2,
    cy: LABEL_H + hov.row * (CELL + GAP),
    corr: matrix[hov.row][hov.col],
    nameA: stocks[hov.row].name,
    nameB: stocks[hov.col].name,
  } : null

  const showTooltipAbove = tooltipInfo ? tooltipInfo.cy > LABEL_H + 10 : true
  const tooltipTop = tooltipInfo
    ? showTooltipAbove
      ? tooltipInfo.cy - 8
      : tooltipInfo.cy + CELL + GAP + 8
    : 0

  return (
    <div ref={wrapRef} className="relative w-full overflow-x-auto pb-1">
      {containerW > 0 && (
        <svg width={svgW} height={svgH} style={{ overflow: 'visible', display: 'block' }}>
          {stocks.map((s, col) => (
            <text
              key={col}
              x={LABEL_W + col * (CELL + GAP) + CELL / 2}
              y={LABEL_H - 5}
              textAnchor="middle"
              dominantBaseline="auto"
              fontSize={9}
              style={{ fill: 'var(--color-muted)' }}
              fontFamily="DM Sans, sans-serif"
            >
              {s.label}
            </text>
          ))}

          {stocks.map((s, row) => (
            <text
              key={row}
              x={LABEL_W - 8}
              y={LABEL_H + row * (CELL + GAP) + CELL / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={9}
              style={{ fill: hov?.row === row ? 'var(--color-ink)' : 'var(--color-muted)', transition: 'fill 0.1s' }}
              fontFamily="DM Sans, sans-serif"
            >
              {s.label}
            </text>
          ))}

          {matrix.map((rowData, row) =>
            rowData.map((corr, col) => {
              const cx = LABEL_W + col * (CELL + GAP)
              const cy = LABEL_H + row * (CELL + GAP)
              const isHov = hov?.row === row && hov?.col === col
              const belowThreshold = Math.abs(corr) < minCorr && row !== col
              return (
                <g
                  key={`${row}-${col}`}
                  style={{
                    animation: 'cell-in 0.25s ease both',
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
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                      transform: isHov ? 'scale(1.12)' : 'scale(1)',
                      transition: 'transform 0.12s ease, opacity 0.15s',
                      cursor: 'default',
                      opacity: row === col ? 0.5 : (belowThreshold ? 0.18 : 1),
                    } as React.CSSProperties}
                    onMouseEnter={() => { if (row !== col) setHov({ row, col }) }}
                    onMouseLeave={() => setHov(null)}
                  />
                  {row === col ? (
                    <line
                      x1={cx + 5}
                      y1={cy + 5}
                      x2={cx + CELL - 5}
                      y2={cy + CELL - 5}
                      stroke="var(--color-border)"
                      strokeWidth={1.2}
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                  ) : CELL >= 44 && (
                    <text
                      x={cx + CELL / 2}
                      y={cy + CELL / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.min(10, CELL * 0.2)}
                      fill={corrToTextFill(corr, isDark)}
                      fontFamily="DM Mono, monospace"
                      pointerEvents="none"
                      style={{ opacity: belowThreshold ? 0.18 : 1, transition: 'opacity 0.15s' }}
                    >
                      {corr.toFixed(2)}
                    </text>
                  )}
                </g>
              )
            })
          )}
        </svg>
      )}

      {tooltipInfo && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: Math.min(tooltipInfo.cx, (containerW || 300) - 10),
            top: tooltipTop,
            transform: showTooltipAbove ? 'translate(-50%, -100%)' : 'translateX(-50%)',
          }}
        >
          <div className="bg-paper/95 backdrop-blur-sm border border-border rounded-xl px-3 py-1.5 shadow-lg whitespace-nowrap">
            <p className="text-[11px] font-mono">
              <span className="font-medium text-ink">{tooltipInfo.nameA}</span>
              <span className="text-muted mx-1.5">×</span>
              <span className="font-medium text-ink">{tooltipInfo.nameB}</span>
            </p>
            <p
              className="text-[13px] font-semibold font-mono text-center mt-0.5"
              style={{ color: tooltipInfo.corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
            >
              {tooltipInfo.corr >= 0 ? '+' : ''}{tooltipInfo.corr.toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
