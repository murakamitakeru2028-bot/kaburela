import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { fetchChart, fetchSectorChart, searchStocksApi } from '../../lib/api'
import { corrToFill, corrToTextFill } from '../../lib/colorUtils'
import type { ChartData, CorrelationResponse, SectorData } from '../../lib/api'
import type { StockInfo } from '../../types/stock'
import { PERIODS, type Period } from '../../types/filter'

const COLORS = ['#3b82f6', '#ec4899', '#f97316', '#10b981', '#8b5cf6']
const MAX_STOCKS = 5
const FALLBACK_SUGGESTIONS = ['7203', '6758', '8035', '9432', '8306']
const SECTOR_CODE_PREFIX = 'sector:'
type ChartDisplayMode = 'price' | 'return'

function isSectorIndexCode(code: string): boolean {
  return code.startsWith(SECTOR_CODE_PREFIX)
}

function sectorNameFromCode(code: string): string {
  return code.slice(SECTOR_CODE_PREFIX.length)
}

function sectorIndexStock(sector: SectorData): StockInfo {
  return {
    code: `${SECTOR_CODE_PREFIX}${sector.name}`,
    name: `${sector.name} セクター指数`,
    label: `${sector.name}指数`,
  }
}

function calcCorr(closesA: number[], closesB: number[]): number {
  const n = Math.min(closesA.length, closesB.length) - 1
  if (n < 2) return 0
  const ra = closesA.slice(1, n + 1).map((v, i) => v / closesA[i] - 1)
  const rb = closesB.slice(1, n + 1).map((v, i) => v / closesB[i] - 1)
  const ma = ra.reduce((s, v) => s + v, 0) / n
  const mb = rb.reduce((s, v) => s + v, 0) / n
  const cov = ra.reduce((s, v, i) => s + (v - ma) * (rb[i] - mb), 0)
  const sa = Math.sqrt(ra.reduce((s, v) => s + (v - ma) ** 2, 0))
  const sb = Math.sqrt(rb.reduce((s, v) => s + (v - mb) ** 2, 0))
  return sa && sb ? parseFloat((cov / (sa * sb)).toFixed(2)) : 0
}

const PERFORMANCE_WINDOWS = [
  { label: '前日比', sessions: 1 },
  { label: '1週間', sessions: 5 },
  { label: '1カ月', sessions: 21 },
  { label: '3カ月', sessions: 63 },
  { label: '6カ月', sessions: 126 },
  { label: '1年', sessions: 252 },
  { label: '3年', sessions: 756 },
  { label: '5年', sessions: 1260 },
  { label: '取得来', sessions: null },
] as const

const EXTREME_WINDOWS = [
  { label: '1カ月', sessions: 21 },
  { label: '3カ月', sessions: 63 },
  { label: '6カ月', sessions: 126 },
  { label: '12カ月', sessions: 252 },
] as const

function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null
  return (to / from - 1) * 100
}

function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function valueColor(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return 'var(--color-muted)'
  return value >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'
}

function formatDate(date: string | undefined): string {
  return date ? date.slice(0, 10).replaceAll('-', '/') : '-'
}

function formatShortDate(date: string | undefined): string {
  return date ? date.slice(0, 7).replace('-', '/') : '-'
}

function formatValue(value: number, isIndex: boolean): string {
  const formatted = value.toLocaleString('ja-JP', {
    maximumFractionDigits: isIndex ? 2 : 0,
    minimumFractionDigits: isIndex ? 2 : 0,
  })
  return `${formatted}${isIndex ? ' pt' : '円'}`
}

function formatDiff(value: number | null, isIndex: boolean): string {
  if (value == null || !Number.isFinite(value)) return '-'
  const abs = Math.abs(value).toLocaleString('ja-JP', {
    maximumFractionDigits: isIndex ? 2 : 0,
    minimumFractionDigits: isIndex ? 2 : 0,
  })
  return `${value >= 0 ? '+' : '-'}${abs}${isIndex ? ' pt' : '円'}`
}

function periodReturn(data: ChartData, sessions: number | null): number | null {
  if (data.closes.length < 2) return null
  const end = data.closes.length - 1
  const start = sessions == null ? 0 : end - sessions
  if (start < 0) return null
  return pctChange(data.closes[start], data.closes[end])
}

function calcRecentRows(data: ChartData, isIndex: boolean) {
  return data.closes
    .map((value, idx) => {
      const prev = idx > 0 ? data.closes[idx - 1] : null
      const diff = prev == null ? null : value - prev
      return {
        date: data.dates[idx],
        value: formatValue(value, isIndex),
        diff,
        diffLabel: formatDiff(diff, isIndex),
      }
    })
    .slice(-5)
    .reverse()
}

function calcExtremeMove(data: ChartData, sessions: number) {
  if (data.closes.length <= sessions) return null
  let maxMove = -Infinity
  let minMove = Infinity
  let maxStart = 0
  let maxEnd = sessions
  let minStart = 0
  let minEnd = sessions

  for (let end = sessions; end < data.closes.length; end++) {
    const start = end - sessions
    const move = pctChange(data.closes[start], data.closes[end])
    if (move == null) continue
    if (move > maxMove) {
      maxMove = move
      maxStart = start
      maxEnd = end
    }
    if (move < minMove) {
      minMove = move
      minStart = start
      minEnd = end
    }
  }

  if (!Number.isFinite(maxMove) || !Number.isFinite(minMove)) return null
  return {
    maxMove,
    minMove,
    maxRange: `${formatShortDate(data.dates[maxStart])}~${formatShortDate(data.dates[maxEnd])}`,
    minRange: `${formatShortDate(data.dates[minStart])}~${formatShortDate(data.dates[minEnd])}`,
  }
}

function chartTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min]
  const rough = (max - min) / Math.max(1, count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max; v += step) {
    ticks.push(Number(v.toFixed(8)))
  }
  return ticks.length ? ticks : [min, max]
}

function formatAxisValue(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (abs >= 10000) return `${Math.round(value / 1000)}k`
  if (abs >= 1000) return value.toLocaleString('ja-JP', { maximumFractionDigits: 0 })
  if (abs >= 100) return value.toFixed(0)
  return value.toFixed(2)
}

function toReturnSeries(closes: number[]): number[] {
  const base = closes[0]
  if (!Number.isFinite(base) || base === 0) return closes.map(() => 0)
  return closes.map(value => ((value / base) - 1) * 100)
}

function formatChartPoint(value: number, isIndex: boolean, mode: ChartDisplayMode): string {
  return mode === 'return' ? formatPct(value, 1) : formatValue(value, isIndex)
}

function formatChartAxis(value: number, mode: ChartDisplayMode): string {
  if (mode === 'price') return formatAxisValue(value)
  const digits = Math.abs(value) < 10 ? 1 : 0
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
}

interface LineChartProps {
  selectedStocks: StockInfo[]
  chartData: Map<string, ChartData>
  displayMode: ChartDisplayMode
}

function LineChart({ selectedStocks, chartData, displayMode }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const H = 260
  const MG = { top: 16, right: 16, bottom: 32, left: 54 }
  const chartW = Math.max(width - MG.left - MG.right, 1)
  const chartH = H - MG.top - MG.bottom

  const series = useMemo(() =>
    selectedStocks
      .map((stock, idx) => {
        const data = chartData.get(stock.code)
        if (!data || data.closes.length === 0) return null
        return {
          stock,
          color: COLORS[idx % COLORS.length],
          values: displayMode === 'return' ? toReturnSeries(data.closes) : data.closes,
          dates: data.dates,
          isIndex: isSectorIndexCode(stock.code),
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null),
  [selectedStocks, chartData, displayMode])

  const allValues = series.flatMap(s => s.values)
  const rawMin = allValues.length ? Math.min(...allValues) : 0
  const rawMax = allValues.length ? Math.max(...allValues) : 100
  const pad = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.01, 1)
  const minY = displayMode === 'price' ? Math.max(0, rawMin - pad) : rawMin - pad
  const maxY = rawMax + pad

  const maxLen = Math.max(...series.map(s => s.values.length), 2)
  const xScale = (i: number) => MG.left + (i / (maxLen - 1)) * chartW
  const yScale = (v: number) => MG.top + ((maxY - v) / (maxY - minY)) * chartH

  const gridVals = chartTicks(minY, maxY, 5).filter(v => v > minY && v < maxY)

  function handleMouseMove(e: ReactMouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const raw = (x - MG.left) / chartW * (maxLen - 1)
    const idx = Math.max(0, Math.min(maxLen - 1, Math.round(raw)))
    setHoverX(idx)
  }

  if (series.length === 0) return null

  const hoverDate = hoverX !== null && series[0]?.dates[Math.min(hoverX, series[0].dates.length - 1)]
    ? series[0].dates[Math.min(hoverX, series[0].dates.length - 1)].slice(0, 10)
    : null

  return (
    <div ref={containerRef} className="w-full relative select-none">
      {width > 0 && (
        <svg
          width={width}
          height={H}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverX(null)}
          style={{ cursor: 'crosshair', overflow: 'visible' }}
        >
          {gridVals.map(v => (
            <g key={v}>
              <line
                x1={MG.left}
                y1={yScale(v)}
                x2={width - MG.right}
                y2={yScale(v)}
                stroke="var(--color-border)"
                strokeWidth={0.5}
                strokeDasharray="3,3"
              />
              <text
                x={MG.left - 6}
                y={yScale(v)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={9}
                fill="var(--color-muted)"
                fontFamily="DM Mono, monospace"
              >
                {formatChartAxis(v, displayMode)}
              </text>
            </g>
          ))}

          {series.map(s => {
            const pts = s.values.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ')
            const last = s.values[s.values.length - 1]
            return (
              <g key={s.stock.code}>
                <polyline
                  points={pts}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle
                  cx={xScale(s.values.length - 1)}
                  cy={yScale(last)}
                  r={3}
                  fill={s.color}
                />
              </g>
            )
          })}

          {hoverX !== null && (
            <>
              <line
                x1={xScale(hoverX)}
                y1={MG.top}
                x2={xScale(hoverX)}
                y2={H - MG.bottom}
                stroke="var(--color-muted)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              {series.map(s => {
                const idx = Math.min(hoverX, s.values.length - 1)
                const v = s.values[idx] ?? s.values[s.values.length - 1]
                return (
                  <circle
                    key={s.stock.code}
                    cx={xScale(idx)}
                    cy={yScale(v)}
                    r={4}
                    fill={s.color}
                    stroke={isDark ? '#1c1c1e' : '#ffffff'}
                    strokeWidth={2}
                  />
                )
              })}
            </>
          )}

          {[0, Math.floor((maxLen - 1) / 2), maxLen - 1].map((idx, pos) => {
            const date = series[0]?.dates[Math.min(idx, series[0].dates.length - 1)]
            if (!date) return null
            return (
              <text
                key={`${idx}-${pos}`}
                x={xScale(idx)}
                y={H - 6}
                textAnchor={pos === 0 ? 'start' : pos === 2 ? 'end' : 'middle'}
                fontSize={9}
                fill="var(--color-muted)"
                fontFamily="DM Mono, monospace"
              >
                {date.slice(0, 7)}
              </text>
            )
          })}
        </svg>
      )}

      {hoverX !== null && hoverDate && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-lg text-[11px] font-mono pointer-events-none"
          style={{ background: isDark ? 'rgba(44,44,46,0.92)' : 'rgba(255,255,255,0.92)', border: '1px solid var(--color-border)' }}
        >
          <span className="text-muted">{hoverDate}</span>
          {series.map(s => {
            const idx = Math.min(hoverX, s.values.length - 1)
            const v = s.values[idx] ?? s.values[s.values.length - 1]
            return (
              <span key={s.stock.code} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="font-semibold text-ink">
                  {formatChartPoint(v, s.isIndex, displayMode)}
                </span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CorrTable({ selectedStocks, chartData }: { selectedStocks: StockInfo[]; chartData: Map<string, ChartData> }) {
  const { isDark } = useTheme()

  const matrix = useMemo(() => {
    const closes = selectedStocks.map(s => chartData.get(s.code)?.closes ?? [])
    return selectedStocks.map((_, i) =>
      selectedStocks.map((_, j) => {
        if (i === j) return 1.0
        if (!closes[i].length || !closes[j].length) return 0
        return calcCorr(closes[i], closes[j])
      }),
    )
  }, [selectedStocks, chartData])

  if (selectedStocks.length < 2) return null

  return (
    <div className="mt-4">
      <p className="text-[11px] text-muted font-mono mb-2">銘柄間の相関係数</p>
      <div className="overflow-auto">
        <table className="border-collapse text-[11px] font-mono">
          <thead>
            <tr>
              <th className="w-24" />
              {selectedStocks.map((s, i) => (
                <th key={s.code} className="px-2 py-1 font-semibold text-center" style={{ color: COLORS[i % COLORS.length] }}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedStocks.map((s, i) => (
              <tr key={s.code}>
                <td className="px-2 py-1 font-semibold text-right" style={{ color: COLORS[i % COLORS.length] }}>
                  {s.label}
                </td>
                {matrix[i].map((v, j) => (
                  <td
                    key={j}
                    className="w-14 h-8 text-center tabular-nums font-semibold rounded"
                    style={{
                      background: corrToFill(v, isDark),
                      color: corrToTextFill(v, isDark),
                    }}
                  >
                    {v === 1 ? '1.00' : (v >= 0 ? '+' : '') + v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface ChartDetailsProps {
  stocks: StockInfo[]
  activeStock: StockInfo
  data: ChartData
  activeCode: string | null
  onActiveCodeChange: (code: string) => void
}

function ChartDetails({ stocks, activeStock, data, activeCode, onActiveCodeChange }: ChartDetailsProps) {
  const isIndex = isSectorIndexCode(activeStock.code)
  const latestIdx = data.closes.length - 1
  const latest = data.closes[latestIdx]
  const latestDate = data.dates[latestIdx]
  const first = data.closes[0]
  const totalReturn = pctChange(first, latest)
  const highIdx = data.closes.reduce((best, value, idx) => value > data.closes[best] ? idx : best, 0)
  const lowIdx = data.closes.reduce((best, value, idx) => value < data.closes[best] ? idx : best, 0)
  const recentRows = calcRecentRows(data, isIndex)
  const performance = PERFORMANCE_WINDOWS.map(item => ({
    label: item.label,
    value: periodReturn(data, item.sessions),
  }))
  const extremes = EXTREME_WINDOWS.map(item => ({
    label: item.label,
    extreme: calcExtremeMove(data, item.sessions),
  }))
  const maxExtremeAbs = Math.max(
    1,
    ...extremes.flatMap(item => item.extreme ? [Math.abs(item.extreme.maxMove), Math.abs(item.extreme.minMove)] : []),
  )

  return (
    <div className="pt-5 sm:pt-7 flex flex-col gap-5 sm:gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[14px] font-semibold text-ink">詳細情報</p>
          <p className="text-[11px] text-muted mt-0.5">取得済み価格から計算した推移と騰落率</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stocks.map((stock, idx) => {
            const active = (activeCode ?? stocks[0]?.code) === stock.code
            return (
              <button
                key={stock.code}
                type="button"
                onClick={() => onActiveCodeChange(stock.code)}
                className={`h-[26px] px-2.5 rounded-full border text-[11px] font-mono transition-colors cursor-pointer ${
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
                style={{
                  borderColor: active ? COLORS[idx % COLORS.length] : 'var(--color-border)',
                  backgroundColor: active ? `${COLORS[idx % COLORS.length]}18` : 'transparent',
                }}
              >
                {stock.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1fr)]">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-5 rounded-full bg-[#2563eb]" />
            <h3 className="text-[13px] font-semibold text-ink">基準情報</h3>
          </div>
          <div className="divide-y divide-border">
            {[
              ['最新値', formatValue(latest, isIndex), formatDate(latestDate)],
              ['期間高値', formatValue(data.closes[highIdx], isIndex), formatDate(data.dates[highIdx])],
              ['期間安値', formatValue(data.closes[lowIdx], isIndex), formatDate(data.dates[lowIdx])],
              ['取得来騰落率', formatPct(totalReturn), `${formatDate(data.dates[0])}~${formatDate(latestDate)}`],
            ].map(([label, value, note]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-3">
                <span className="text-[12px] text-muted font-semibold">{label}</span>
                <span className="text-right">
                  <span className="block text-[20px] font-bold text-ink tabular-nums">{value}</span>
                  <span className="block text-[11px] text-muted mt-0.5">{note}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-5 rounded-full bg-[#2563eb]" />
            <h3 className="text-[13px] font-semibold text-ink">最大上昇率・下落率</h3>
          </div>
          <div className="px-1 py-1">
            <div className="grid grid-cols-4 gap-3">
              {extremes.map(({ label, extreme }) => (
                <div key={label} className="min-w-0">
                  <p className="text-[12px] text-muted font-semibold text-center">{label}</p>
                  <div className="h-28 mt-2 flex flex-col justify-center gap-1">
                    {extreme ? (
                      <>
                        <div className="h-10 flex flex-col justify-end">
                          <div
                            className="mx-auto w-8 rounded-t"
                            style={{
                              height: `${Math.max(5, Math.abs(extreme.maxMove) / maxExtremeAbs * 38)}px`,
                              backgroundColor: 'var(--color-pos)',
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-center font-mono" style={{ color: 'var(--color-pos)' }}>{formatPct(extreme.maxMove)}</p>
                        <div className="h-px bg-border" />
                        <p className="text-[10px] text-center font-mono" style={{ color: 'var(--color-neg)' }}>{formatPct(extreme.minMove)}</p>
                        <div className="h-10 flex flex-col justify-start">
                          <div
                            className="mx-auto w-8 rounded-b"
                            style={{
                              height: `${Math.max(5, Math.abs(extreme.minMove) / maxExtremeAbs * 38)}px`,
                              backgroundColor: 'var(--color-neg)',
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[11px] text-muted font-mono">-</div>
                    )}
                  </div>
                  {extreme && (
                    <div className="text-center text-[9px] text-muted font-mono leading-tight">
                      <p>{extreme.maxRange}</p>
                      <p className="mt-1">{extreme.minRange}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px] font-mono text-muted">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-pos)]" />最大上昇率</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-neg)]" />最大下落率</span>
            </div>
          </div>
        </section>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-5 rounded-full bg-[#2563eb]" />
          <h3 className="text-[13px] font-semibold text-ink">価格推移</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[620px] border-collapse text-[12px]">
            <tbody>
              <tr className="border-b border-border">
                <th className="text-left text-muted font-semibold py-2 pr-3">日付</th>
                {recentRows.map(row => <td key={row.date} className="text-right py-2 pl-3 font-mono">{formatDate(row.date)}</td>)}
              </tr>
              <tr className="border-b border-border">
                <th className="text-left text-muted font-semibold py-2 pr-3">{isIndex ? '指数値' : '終値'}</th>
                {recentRows.map(row => <td key={row.date} className="text-right py-2 pl-3 font-mono">{row.value}</td>)}
              </tr>
              <tr className="border-b border-border">
                <th className="text-left text-muted font-semibold py-2 pr-3">前日比</th>
                {recentRows.map(row => (
                  <td key={row.date} className="text-right py-2 pl-3 font-mono" style={{ color: valueColor(row.diff) }}>
                    {row.diffLabel}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-5 rounded-full bg-[#2563eb]" />
          <h3 className="text-[13px] font-semibold text-ink">騰落率</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12px]">
            <tbody>
              <tr className="border-b border-border">
                <th className="text-left text-muted font-semibold py-2 pr-3">期間</th>
                {performance.map(item => <td key={item.label} className="text-right py-2 pl-3 font-semibold">{item.label}</td>)}
              </tr>
              <tr className="border-b border-border">
                <th className="text-left text-muted font-semibold py-2 pr-3">騰落率</th>
                {performance.map(item => (
                  <td key={item.label} className="text-right py-2 pl-3 font-mono font-semibold" style={{ color: valueColor(item.value) }}>
                    {formatPct(item.value)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

interface SectorPanelProps {
  sectors: SectorData[]
  selectedCodes: Set<string>
  disabled: boolean
  onSelect: (stock: StockInfo) => void
}

function SectorBrowsePanel({ sectors, selectedCodes, disabled, onSelect }: SectorPanelProps) {
  return (
    <div
      className="border border-border rounded-xl overflow-hidden bg-paper"
      style={{ animation: 'fade-up 0.2s cubic-bezier(0.16,1,0.3,1) both' }}
    >
      <div className="divide-y divide-border">
        {sectors.map(sec => (
          <div key={sec.name} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
            <div className="flex min-w-0 items-center gap-1.5 sm:w-24 sm:shrink-0 sm:pt-0.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sec.color }} />
              <span className="text-[10px] text-muted font-mono truncate">{sec.name}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sec.stocks.map(stock => {
                const added = selectedCodes.has(stock.code)
                return (
                  <button
                    key={stock.code}
                    title={stock.name}
                    onClick={() => !added && !disabled && onSelect(stock)}
                    disabled={added || disabled}
                    className="h-[22px] px-2 rounded-full border text-[11px] font-mono transition-colors cursor-pointer disabled:cursor-default"
                    style={{
                      borderColor: added ? sec.color + '80' : 'var(--color-border)',
                      backgroundColor: added ? sec.color + '18' : 'transparent',
                      color: added ? sec.color : 'var(--color-muted)',
                      opacity: disabled && !added ? 0.45 : 1,
                    }}
                  >
                    {stock.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface CorrSuggestion {
  stock: StockInfo
  corr: number
}

interface CorrSuggestionsProps {
  suggestions: CorrSuggestion[]
  baseStock: StockInfo
  onSelect: (stock: StockInfo) => void
}

function CorrSuggestions({ suggestions, baseStock, onSelect }: CorrSuggestionsProps) {
  if (suggestions.length === 0) return null
  return (
    <div className="flex flex-col gap-2" style={{ animation: 'fade-up 0.25s cubic-bezier(0.16,1,0.3,1) both' }}>
      <p className="text-[11px] text-muted font-mono">
        <span className="font-semibold text-ink">{baseStock.label}</span> と相関が高い銘柄
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map(({ stock, corr }) => (
          <button
            key={stock.code}
            title={stock.name}
            onClick={() => onSelect(stock)}
            className="flex items-center gap-1.5 px-3 h-[28px] rounded-full border border-border text-[12px] font-mono hover:border-muted transition-colors cursor-pointer group"
          >
            <span className="text-muted group-hover:text-ink transition-colors">{stock.label}</span>
            <span
              className="tabular-nums text-[11px] font-semibold"
              style={{ color: corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
            >
              {corr >= 0 ? '+' : ''}{corr.toFixed(2)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface Props {
  period: Period
  onPeriodChange: (period: Period) => void
  initialStock?: StockInfo | null
  sectors?: SectorData[]
  correlation?: CorrelationResponse | null
  onBack?: () => void
  backLabel?: string
}

export function ChartView({ period, onPeriodChange, initialStock, sectors, correlation, onBack, backLabel }: Props) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StockInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [selectedStocks, setSelectedStocks] = useState<StockInfo[]>(() => initialStock ? [initialStock] : [])
  const [chartData, setChartData] = useState<Map<string, ChartData>>(new Map())
  const [loadingCodes, setLoadingCodes] = useState<Set<string>>(new Set())
  const [errorCodes, setErrorCodes] = useState<Set<string>>(new Set())
  const [suggestionStocks, setSuggestionStocks] = useState<StockInfo[]>([])
  const [sectorPanelOpen, setSectorPanelOpen] = useState(false)
  const [detailCode, setDetailCode] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<Map<string, ChartData>>(new Map())
  const [displayMode, setDisplayMode] = useState<ChartDisplayMode>('price')

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadChart = useCallback(async (code: string) => {
    setLoadingCodes(prev => new Set(prev).add(code))
    setErrorCodes(prev => {
      const next = new Set(prev)
      next.delete(code)
      return next
    })
    try {
      const data = isSectorIndexCode(code)
        ? await fetchSectorChart(sectorNameFromCode(code), period)
        : await fetchChart(code, period)
      setChartData(prev => new Map(prev).set(code, data))
    } catch {
      setErrorCodes(prev => new Set(prev).add(code))
    } finally {
      setLoadingCodes(prev => {
        const next = new Set(prev)
        next.delete(code)
        return next
      })
    }
  }, [period])

  const addStock = useCallback((stock: StockInfo) => {
    if (selectedStocks.some(s => s.code === stock.code)) return
    if (selectedStocks.length >= MAX_STOCKS) return
    setSelectedStocks(prev => [...prev, stock])
    void loadChart(stock.code)
    setQuery('')
    setSearchResults([])
    setDropdownOpen(false)
    setSearchOpen(false)
  }, [loadChart, selectedStocks])

  useEffect(() => {
    if (sectors && sectors.length > 0) return
    Promise.all(FALLBACK_SUGGESTIONS.map(code => searchStocksApi(code)))
      .then(results => {
        const stocks = results.flatMap(r => r.slice(0, 1)).filter((s): s is StockInfo => !!s)
        setSuggestionStocks(stocks)
      })
      .catch(() => {})
  }, [sectors])

  const corrSuggestions = useMemo((): CorrSuggestion[] => {
    if (!correlation || selectedStocks.length === 0 || selectedStocks.length >= MAX_STOCKS) return []
    const selectedCodes = new Set(selectedStocks.map(s => s.code))
    const baseStock = selectedStocks[0]
    const baseIdx = correlation.stocks.findIndex(s => s.code === baseStock.code)
    if (baseIdx === -1) return []

    const scores = new Map<string, { stock: StockInfo; absCorr: number; signedCorr: number }>()
    correlation.stocks.forEach((candidate, j) => {
      if (selectedCodes.has(candidate.code)) return
      const signed = correlation.matrix[baseIdx][j]
      const abs = Math.abs(signed)
      const prev = scores.get(candidate.code)
      if (!prev || abs > prev.absCorr) {
        scores.set(candidate.code, { stock: candidate, absCorr: abs, signedCorr: signed })
      }
    })

    return [...scores.values()]
      .sort((a, b) => b.absCorr - a.absCorr)
      .slice(0, 6)
      .map(x => ({ stock: x.stock, corr: x.signedCorr }))
  }, [correlation, selectedStocks])

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await searchStocksApi(q)
        setSearchResults(results)
        setDropdownOpen(results.length > 0)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setSearchOpen(false)
        setInputFocused(false)
        setQuery('')
        setSearchResults([])
        setIsSearching(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (selectedStocks.length === 0) return
    queueMicrotask(() => {
      setChartData(new Map())
      selectedStocks.forEach(s => loadChart(s.code))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  function removeStock(code: string) {
    setSelectedStocks(prev => prev.filter(s => s.code !== code))
    setChartData(prev => {
      const next = new Map(prev)
      next.delete(code)
      return next
    })
    setErrorCodes(prev => {
      const next = new Set(prev)
      next.delete(code)
      return next
    })
  }

  const loadedStocks = selectedStocks.filter(s => chartData.has(s.code))
  const isAnyLoading = loadingCodes.size > 0
  const isFull = selectedStocks.length >= MAX_STOCKS
  const selectedCodes = useMemo(() => new Set(selectedStocks.map(s => s.code)), [selectedStocks])
  const stockSectorMap = useMemo(() => {
    const map = new Map<string, string>()
    sectors?.forEach(sec => sec.stocks.forEach(stock => map.set(stock.code, sec.name)))
    return map
  }, [sectors])
  const sectorIndexOptions = useMemo(() => {
    if (!sectors) return []
    const baseSector = selectedStocks
      .filter(stock => !isSectorIndexCode(stock.code))
      .map(stock => stockSectorMap.get(stock.code))
      .find((name): name is string => Boolean(name))
    const sector = sectors.find(s => s.name === baseSector)
    return sector ? [sectorIndexStock(sector)] : []
  }, [sectors, selectedStocks, stockSectorMap])
  const activeDetailStock = loadedStocks.find(s => s.code === detailCode) ?? loadedStocks[0] ?? null
  const activeDetailData = activeDetailStock
    ? detailData.get(activeDetailStock.code) ?? chartData.get(activeDetailStock.code) ?? null
    : null
  const showSectorPanel = sectorPanelOpen && sectors && sectors.length > 0
  const searchActive = dropdownOpen || inputFocused

  useEffect(() => {
    if (!activeDetailStock || detailData.has(activeDetailStock.code)) return
    let cancelled = false
    const request = isSectorIndexCode(activeDetailStock.code)
      ? fetchSectorChart(sectorNameFromCode(activeDetailStock.code), '5Y')
      : fetchChart(activeDetailStock.code, '5Y')

    request
      .then(data => {
        if (cancelled) return
        setDetailData(prev => new Map(prev).set(activeDetailStock.code, data))
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [activeDetailStock, detailData])

  function updateQuery(value: string) {
    setQuery(value)
    if (!value.trim()) {
      setSearchResults([])
      setDropdownOpen(false)
      setIsSearching(false)
    }
  }

  return (
    <div className="px-1.5 py-3 sm:px-5 sm:py-5 flex flex-col gap-4 sm:gap-5 max-w-6xl mx-auto w-full">
      <section
        className="px-1 py-2"
        style={{ animation: 'fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex items-start gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={backLabel ? `${backLabel}に戻る` : '戻る'}
                title={backLabel ? `${backLabel}に戻る` : '戻る'}
                className="mt-1 h-9 w-9 rounded-[10px] border border-border bg-paper text-muted hover:text-ink hover:border-muted transition-colors cursor-pointer flex items-center justify-center shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M9.75 3.75L5.5 8l4.25 4.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div className="min-w-0">
            <p className="text-[11px] text-muted font-mono tracking-[0.08em] uppercase">Kaburela Chart</p>
            <h2 className="mt-1 text-[26px] font-semibold text-ink tracking-[-0.4px]">チャート比較</h2>
            <p className="text-[13px] text-muted mt-1">
              銘柄とキャッシュ済み価格で作るセクター指数を、静かに並べて比較します。
            </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (isFull) return
                  setSearchOpen(v => !v)
                  if (searchResults.length) setDropdownOpen(true)
                }}
                disabled={isFull}
                className="h-10 px-3 sm:px-4 rounded-full bg-ink text-paper text-[13px] font-semibold flex items-center gap-2 shadow-[0_8px_22px_rgba(0,0,0,0.14)] disabled:opacity-45 disabled:cursor-default cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden>
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                比較銘柄を追加
              </button>

              {searchOpen && (
                <div className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[360px] sm:max-w-[calc(100vw-40px)] rounded-2xl border border-border bg-paper shadow-[0_18px_52px_rgba(0,0,0,0.18)] z-50 overflow-hidden">
                  <div className={`flex items-center gap-2 px-3 h-12 border-b transition-colors ${searchActive ? 'border-muted' : 'border-border'}`}>
                    {isSearching ? (
                      <div className="w-3 h-3 border border-border border-t-muted rounded-full animate-spin shrink-0" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
                        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={e => updateQuery(e.target.value)}
                      onFocus={() => {
                        setInputFocused(true)
                        if (searchResults.length) setDropdownOpen(true)
                      }}
                      onBlur={() => setInputFocused(false)}
                      placeholder="銘柄コード・名前で検索"
                      className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted outline-none"
                    />
                    {query && (
                      <button onClick={() => updateQuery('')} className="text-muted hover:text-ink shrink-0 cursor-pointer">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {dropdownOpen && searchResults.length > 0 ? (
                    <div className="max-h-80 overflow-auto">
                      {searchResults.slice(0, 8).map(stock => (
                        <button
                          key={stock.code}
                          onClick={() => addStock(stock)}
                          disabled={!!selectedStocks.find(s => s.code === stock.code)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <span className="text-[11px] font-mono text-muted w-10 shrink-0">{stock.code}</span>
                          <span className="text-[13px] text-ink flex-1 truncate">{stock.name}</span>
                          <span className="text-[11px] font-mono text-muted shrink-0">{stock.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-3 text-[11px] text-muted font-mono">
                      最大 {MAX_STOCKS} 件まで重ねて比較できます。
                    </p>
                  )}
                </div>
              )}
            </div>

            {sectors && sectors.length > 0 && (
              <button
                onClick={() => setSectorPanelOpen(v => !v)}
                className="h-10 px-3 sm:px-4 rounded-full bg-subtle text-[13px] font-semibold text-muted hover:text-ink transition-colors cursor-pointer shrink-0"
              >
                セクターから選択
              </button>
            )}
          </div>
        </div>
      </section>

      {showSectorPanel && (
        <SectorBrowsePanel
          sectors={sectors!}
          selectedCodes={selectedCodes}
          disabled={isFull}
          onSelect={stock => { addStock(stock); setSectorPanelOpen(false) }}
        />
      )}

      {sectorIndexOptions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] text-muted font-mono shrink-0">セクター指数</span>
          {sectorIndexOptions.map(sectorIndex => {
            const added = selectedCodes.has(sectorIndex.code)
            return (
              <button
                key={sectorIndex.code}
                type="button"
                onClick={() => addStock(sectorIndex)}
                disabled={added || isFull}
                title={sectorIndex.name}
                className="h-[26px] px-3 rounded-full border border-border text-[11px] font-mono text-muted hover:text-ink hover:border-muted disabled:opacity-45 disabled:cursor-default cursor-pointer whitespace-nowrap transition-colors"
              >
                {added ? '追加済み ' : '+ '}{sectorNameFromCode(sectorIndex.code)}
              </button>
            )
          })}
        </div>
      )}

      {selectedStocks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedStocks.map((stock, idx) => {
            const color = COLORS[idx % COLORS.length]
            const data = chartData.get(stock.code)
            const isLoading = loadingCodes.has(stock.code)
            const hasError = errorCodes.has(stock.code)
            const latestValue = data?.closes.at(-1) ?? null
            const latestReturn = data && data.closes.length > 0
              ? pctChange(data.closes[0], data.closes[data.closes.length - 1])
              : null
            const isIndex = isSectorIndexCode(stock.code)

            return (
              <div
                key={stock.code}
                className="flex items-center gap-1.5 px-3 h-[28px] rounded-full border text-[12px] font-mono"
                style={{ borderColor: color + '60', backgroundColor: color + '14' }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-ink font-semibold">{stock.label}</span>
                {isLoading && <span className="text-muted text-[10px]">読込中...</span>}
                {hasError && <span className="text-[10px]" style={{ color: 'var(--color-neg)' }}>取得失敗</span>}
                {latestValue != null && !isLoading && !hasError && (
                  <span
                    className="tabular-nums"
                    style={{ color: displayMode === 'return' ? valueColor(latestReturn) : 'var(--color-muted)' }}
                  >
                    {displayMode === 'return' ? formatPct(latestReturn, 1) : formatValue(latestValue, isIndex)}
                  </span>
                )}
                <button
                  onClick={() => removeStock(stock.code)}
                  className="text-muted hover:text-ink transition-colors cursor-pointer ml-0.5"
                  aria-label={`${stock.name}を削除`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )
          })}
          {isAnyLoading && (
            <span className="text-[11px] text-muted font-mono self-center">データ取得中...</span>
          )}
        </div>
      )}

      {corrSuggestions.length > 0 && !isFull && (
        <CorrSuggestions
          suggestions={corrSuggestions}
          baseStock={selectedStocks[0]}
          onSelect={addStock}
        />
      )}

      {loadedStocks.length > 0 ? (
        <>
          <section className="pt-3 border-t border-border">
            <div className="px-1 pt-2 pb-3 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] text-muted font-mono tracking-[0.08em] uppercase">Performance</p>
                <h3 className="mt-1 text-[18px] sm:text-[22px] font-semibold text-ink tracking-[-0.3px] truncate">
                  {loadedStocks.map(stock => stock.label).join(' / ')}
                </h3>
              </div>
              <span className="text-[11px] text-muted font-mono tabular-nums">
                {loadedStocks.length} / {MAX_STOCKS}
              </span>
            </div>

            <div className="px-1 pb-3 flex items-start sm:items-center justify-between gap-3 flex-wrap">
              <span className="text-[11px] text-muted font-mono">表示期間</span>
              <div className="min-w-0 flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                <div className="flex items-center bg-subtle rounded-full p-[3px] gap-[2px]">
                  {(['price', 'return'] as ChartDisplayMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDisplayMode(mode)}
                      className={`h-[30px] px-3 rounded-full text-[12px] font-semibold transition-all cursor-pointer ${
                        displayMode === mode
                          ? 'bg-paper text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {mode === 'price' ? '価格' : '騰落率'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {PERIODS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onPeriodChange(p)}
                      className={`h-[30px] px-2 text-[12px] font-semibold transition-colors cursor-pointer tabular-nums ${
                        period === p
                          ? 'text-ink'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="py-2">
              <LineChart selectedStocks={loadedStocks} chartData={chartData} displayMode={displayMode} />
            </div>
          </section>

          <section className="pt-2">
            <CorrTable selectedStocks={loadedStocks} chartData={chartData} />
            {activeDetailStock && activeDetailData && (
              <ChartDetails
                stocks={loadedStocks}
                activeStock={activeDetailStock}
                data={activeDetailData}
                activeCode={detailCode}
                onActiveCodeChange={setDetailCode}
              />
            )}
          </section>
        </>
      ) : selectedStocks.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-5 py-14 rounded-2xl border border-dashed border-border"
          style={{ animation: 'fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-muted" aria-hidden>
              <circle cx="14" cy="14" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21L28 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M14 10v8M10 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] text-muted">
              {sectors && sectors.length > 0
                ? '上の検索バーで銘柄を探すか、セクターボタンから選んでください'
                : '銘柄を検索して追加してください'}
            </p>
          </div>
          {(!sectors || sectors.length === 0) && suggestionStocks.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[11px] text-muted">よく見られる銘柄</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestionStocks.map((s, i) => (
                  <button
                    key={s.code}
                    onClick={() => addStock(s)}
                    className="flex items-center gap-1.5 px-3 h-[28px] rounded-full border border-border text-[12px] font-mono text-muted hover:text-ink hover:border-muted transition-colors cursor-pointer"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-paper rounded-2xl border border-border h-[260px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-border border-t-muted rounded-full animate-spin" />
            <span className="text-[11px] text-muted">チャートデータ取得中...</span>
          </div>
        </div>
      )}
    </div>
  )
}
