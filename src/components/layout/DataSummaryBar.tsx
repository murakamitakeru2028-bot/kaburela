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
  const visibleStocks = sectors.flatMap(sector => sector.stocks)
  const visibleCodes = new Set(visibleStocks.map(stock => stock.code))
  const zeroPairs = countZeroPairs(correlation, visibleCodes)
  const lastBatch = health?.last_batch
  const updatedAt = formatDateTime(lastBatch?.finished_at ?? lastBatch?.started_at)
  const method = view === 'chart'
    ? '価格: キャッシュ終値 / 指数: 等ウェイト'
    : view === 'macro'
      ? '日次リターン相関'
      : '日次リターン相関 / キャッシュ価格'

  return (
    <div className="px-2 sm:px-4 lg:px-6 pb-2">
      <div className="border-y border-border py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted">
        <span className="font-mono tabular-nums">期間 <b className="text-ink">{period}</b></span>
        <span className="font-mono tabular-nums">目安 <b className="text-ink">{SESSION_ESTIMATE[period]}</b> 営業日</span>
        <span>対象 <b className="text-ink">{visibleStocks.length}</b> 銘柄 / <b className="text-ink">{sectors.length}</b> セクター</span>
        <span>更新 <b className="text-ink">{updatedAt}</b></span>
        <span title="相関が未算出、またはほぼ0として扱われているペアです">
          0.00扱い <b className="text-ink">{zeroPairs}</b> ペア
        </span>
        <span className="ml-auto min-w-0 truncate" title={method}>算出: {method}</span>
      </div>
    </div>
  )
}
