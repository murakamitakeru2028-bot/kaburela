import { useMemo } from 'react'
import type { CorrelationResponse, HealthResponse, SectorData } from '../../lib/api'
import type { View } from './tabConfig'
import type { Period } from '../../types/filter'

const SESSION_ESTIMATE: Record<Period, number> = {
  '1M': 21,
  '3M': 63,
  '6M': 126,
  '1Y': 252,
  '3Y': 756,
  '5Y': 1260,
}

interface Props {
  view: View
  period: Period
  sectors: SectorData[]
  correlation: CorrelationResponse | null
  health: HealthResponse | null
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ')
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function countZeroPairs(correlation: CorrelationResponse | null, visibleCodes: Set<string>): number {
  if (!correlation || visibleCodes.size === 0) return 0
  const visibleIndexes = correlation.stocks
    .map((stock, index) => (visibleCodes.has(stock.code) ? index : -1))
    .filter(index => index >= 0)

  let count = 0
  for (let a = 0; a < visibleIndexes.length; a++) {
    for (let b = a + 1; b < visibleIndexes.length; b++) {
      const value = correlation.matrix[visibleIndexes[a]]?.[visibleIndexes[b]]
      if (value === 0) count++
    }
  }
  return count
}

export function DataSummaryBar({ view, period, sectors, correlation, health }: Props) {
  const visibleStocks = useMemo(() => sectors.flatMap(sector => sector.stocks), [sectors])
  const visibleCodes = useMemo(() => new Set(visibleStocks.map(stock => stock.code)), [visibleStocks])
  const hideZeroPairs = view === 'macro'
  const zeroPairs = useMemo(
    () => hideZeroPairs ? 0 : countZeroPairs(correlation, visibleCodes),
    [hideZeroPairs, correlation, visibleCodes],
  )
  const lastBatch = health?.last_batch
  const updatedAt = formatDateTime(lastBatch?.finished_at ?? lastBatch?.started_at)
  const method = view === 'chart'
    ? '価格: キャッシュ終値 / 指数: 等ウェイト'
    : view === 'macro'
      ? 'マクロ指標 × 銘柄 日次リターン相関'
      : '日次リターン相関 / キャッシュ価格'

  return (
    <div className="px-1 sm:px-4 lg:px-6 pb-2">
      <div className="border-y border-border py-2 flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-5 text-[10px] sm:text-[11px] text-muted">
        <span className="font-mono tabular-nums">観測 <b className="text-ink">{SESSION_ESTIMATE[period]}</b> 営業日</span>
        <span>対象 <b className="text-ink">{visibleStocks.length}</b> 銘柄 / <b className="text-ink">{sectors.length}</b> セクター</span>
        <span>更新 <b className="text-ink">{updatedAt}</b></span>
        {!hideZeroPairs && (
          <span title="相関が未計算、またはほぼ0として扱われているペアです">
            0.00扱い <b className="text-ink">{zeroPairs}</b> ペア
          </span>
        )}
        <span className="w-full min-w-0 truncate sm:ml-auto sm:w-auto" title={method}>計算 {method}</span>
      </div>
    </div>
  )
}
