import { useMemo, type ReactNode } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { corrToFill } from '../../lib/colorUtils'
import type { View } from '../layout/tabConfig'
import type { CorrelationResponse, HealthResponse, SectorData } from '../../lib/api'
import type { Period } from '../../types/filter'

interface Props {
  onNavigate: (view: View) => void
  sectors: SectorData[]
  correlation: CorrelationResponse | null
  health: HealthResponse | null
  period: Period
}

interface PairSummary {
  labelA: string
  labelB: string
  corr: number
}

const ACCENTS = {
  heatmap: '#ff34ff',
  network: '#16a3ff',
  macro: '#ffb000',
  ranking: '#00c878',
  chart: '#725cff',
} as const

const SESSION_ESTIMATE: Record<Period, number> = {
  '1M': 21,
  '3M': 63,
  '6M': 126,
  '1Y': 252,
  '3Y': 756,
  '5Y': 1260,
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '未取得'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ')
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCorr(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.5 8h8M8.5 5l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MiniCorrGrid({ matrix, isDark, limit = 6 }: {
  matrix: number[][]
  isDark: boolean
  limit?: number
}) {
  const visible = matrix.slice(0, limit).map(row => row.slice(0, limit))
  if (!visible.length) return <div className="h-32 rounded-[8px] bg-subtle" />

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
    >
      {visible.flatMap((row, r) => row.map((value, c) => (
        <span
          key={`${r}-${c}`}
          className="aspect-square rounded-[4px]"
          style={{ backgroundColor: corrToFill(value, isDark), animation: `cell-in 0.34s ease both ${((r + c) * 20)}ms` }}
        />
      )))}
    </div>
  )
}

function HeroSignalGrid({ correlation, isDark }: {
  correlation: CorrelationResponse | null
  isDark: boolean
}) {
  const matrix = correlation?.matrix.slice(0, 9).map(row => row.slice(0, 9)) ?? []
  const fallback = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => (r === c ? 1 : Math.cos((r + c) * 0.9) * 0.62)),
  )
  const visible = matrix.length >= 5 ? matrix : fallback

  return (
    <div className="grid grid-cols-9 gap-1 w-full max-w-[280px]">
      {visible.flatMap((row, r) => row.map((value, c) => (
        <span
          key={`${r}-${c}`}
          className="aspect-square rounded-[5px]"
          style={{
            backgroundColor: corrToFill(value, isDark),
            animation: `cell-in 0.35s ease both ${((r * 9 + c) % 18) * 18}ms`,
          }}
        />
      )))}
    </div>
  )
}

function MiniNetworkSvg({ stocks, matrix, isDark }: {
  stocks: CorrelationResponse['stocks']
  matrix: number[][]
  isDark: boolean
}) {
  const n = Math.min(stocks.length, 14)
  const width = 280
  const height = 150
  const centerX = width / 2
  const centerY = height / 2
  const radius = 54
  const points = Array.from({ length: Math.max(n, 1) }, (_, index) => ({
    x: centerX + radius * Math.cos((Math.PI * 2 * index) / Math.max(n, 1) - Math.PI / 2),
    y: centerY + radius * Math.sin((Math.PI * 2 * index) / Math.max(n, 1) - Math.PI / 2),
  }))

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden>
      {Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
          if (j <= i) return null
          const corr = matrix[i]?.[j] ?? 0
          if (Math.abs(corr) < 0.55) return null
          return (
            <line
              key={`${i}-${j}`}
              x1={points[i].x}
              y1={points[i].y}
              x2={points[j].x}
              y2={points[j].y}
              stroke={corr >= 0 ? ACCENTS.ranking : '#ff4f5e'}
              strokeWidth={Math.max(1, Math.abs(corr) * 3)}
              strokeOpacity={isDark ? 0.7 : 0.48}
              strokeLinecap="round"
            />
          )
        })
      )}
      {points.slice(0, n).map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={6}
          fill={isDark ? '#1c1c1e' : '#ffffff'}
          stroke={index % 3 === 0 ? ACCENTS.heatmap : index % 3 === 1 ? ACCENTS.network : ACCENTS.macro}
          strokeWidth={1.6}
        />
      ))}
    </svg>
  )
}

function RankingPreview({ pairs }: { pairs: PairSummary[] }) {
  const rows = pairs.length ? pairs.slice(0, 4) : [
    { labelA: '7203', labelB: '7267', corr: 0.86 },
    { labelA: '6758', labelB: '6861', corr: 0.73 },
    { labelA: '8306', labelB: '8316', corr: 0.68 },
    { labelA: '9432', labelB: '9433', corr: 0.62 },
  ]

  return (
    <div className="w-full space-y-2.5">
      {rows.map((pair, index) => (
        <div key={`${pair.labelA}-${pair.labelB}-${index}`} className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="w-4 text-muted tabular-nums">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{pair.labelA} / {pair.labelB}</span>
            <span className="font-semibold tabular-nums" style={{ color: pair.corr >= 0 ? ACCENTS.ranking : '#ff4f5e' }}>
              {formatCorr(pair.corr)}
            </span>
          </div>
          <div className="ml-6 h-[3px] rounded-full bg-subtle overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(12, Math.min(100, Math.abs(pair.corr) * 100))}%`, backgroundColor: pair.corr >= 0 ? ACCENTS.ranking : '#ff4f5e' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartPreview() {
  const points = '8,80 44,66 80,71 116,48 152,54 188,34 224,39 260,18'
  return (
    <svg width="100%" height="140" viewBox="0 0 268 140" fill="none" aria-hidden>
      <path d="M8 112H260" stroke="var(--color-border)" strokeDasharray="4 5" />
      <path d="M8 76H260" stroke="var(--color-border)" strokeDasharray="4 5" />
      <path d="M8 40H260" stroke="var(--color-border)" strokeDasharray="4 5" />
      <polyline points={points} fill="none" stroke={ACCENTS.chart} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="8,96 44,88 80,91 116,78 152,69 188,76 224,58 260,62" fill="none" stroke={ACCENTS.network} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
      {[8, 80, 152, 224, 260].map(x => (
        <circle key={x} cx={x} cy={x === 260 ? 18 : x === 224 ? 39 : x === 152 ? 54 : x === 80 ? 71 : 80} r="4" fill={ACCENTS.chart} />
      ))}
    </svg>
  )
}

function TrendPreview({ pair }: { pair: PairSummary | null }) {
  const delta = pair ? Math.min(0.46, Math.max(-0.46, pair.corr * 0.42)) : 0.28
  const before = pair ? pair.corr - delta : 0.24
  const after = pair ? pair.corr : 0.62
  const shift = after - before

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-[58px_minmax(0,1fr)_54px] items-center gap-3">
        <span className="text-[11px] font-mono text-muted">基準</span>
        <span className="h-2 rounded-full bg-subtle overflow-hidden">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(8, Math.abs(before) * 100)}%`, backgroundColor: before >= 0 ? ACCENTS.ranking : '#ff4f5e', opacity: 0.48 }}
          />
        </span>
        <span className="text-[11px] font-mono font-semibold text-ink tabular-nums text-right">{formatCorr(before)}</span>
      </div>
      <div className="grid grid-cols-[58px_minmax(0,1fr)_54px] items-center gap-3">
        <span className="text-[11px] font-mono text-muted">短期</span>
        <span className="h-2 rounded-full bg-subtle overflow-hidden">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(8, Math.abs(after) * 100)}%`, backgroundColor: after >= 0 ? ACCENTS.ranking : '#ff4f5e', opacity: 0.86 }}
          />
        </span>
        <span className="text-[11px] font-mono font-semibold text-ink tabular-nums text-right">{formatCorr(after)}</span>
      </div>
      <div className="rounded-[8px] border border-border bg-bg px-3 py-2 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[11px] font-mono text-muted">
          {pair ? `${pair.labelA} / ${pair.labelB}` : '変化ペア'}
        </span>
        <span className="text-[13px] font-mono font-semibold tabular-nums" style={{ color: shift >= 0 ? ACCENTS.ranking : '#ff4f5e' }}>
          {shift >= 0 ? '+' : ''}{shift.toFixed(2)}
        </span>
      </div>
    </div>
  )
}

function MacroPreview() {
  const rows = [
    { label: 'USD/JPY', value: 72, color: ACCENTS.network },
    { label: 'NASDAQ', value: 56, color: ACCENTS.heatmap },
    { label: 'WTI', value: 38, color: ACCENTS.macro },
    { label: '10Y JGB', value: 64, color: ACCENTS.ranking },
  ]
  return (
    <div className="w-full space-y-3">
      {rows.map(row => (
        <div key={row.label} className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3">
          <span className="text-[11px] font-mono text-muted">{row.label}</span>
          <span className="h-2 rounded-full bg-subtle overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${row.value}%`, backgroundColor: row.color, opacity: 0.78 }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

function StatPill({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="min-w-0 border-y border-border py-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted truncate">{label}</p>
      <p className="mt-1 text-[20px] font-semibold tracking-[-0.3px] text-ink tabular-nums truncate">{value}</p>
      <p className="mt-1 text-[10px] text-muted truncate">{hint}</p>
    </div>
  )
}

function PairFocusPanel({ pair }: { pair: PairSummary | null }) {
  const tone = pair && pair.corr < 0 ? '#ff4f5e' : ACCENTS.ranking
  const strength = pair ? Math.max(10, Math.abs(pair.corr) * 100) : 24

  return (
    <div className="h-full flex flex-col justify-between gap-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">注目ペア</span>
        <span className="text-[11px] font-mono text-muted">絶対値最大</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_34px_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0 rounded-[8px] border border-border bg-bg px-3 py-3">
          <p className="text-[10px] font-mono text-muted">A</p>
          <p className="mt-1 text-[17px] font-semibold text-ink truncate">{pair?.labelA ?? '----'}</p>
        </div>
        <div className="h-[34px] w-[34px] rounded-full flex items-center justify-center text-[12px] font-mono text-paper" style={{ backgroundColor: tone }}>
          /
        </div>
        <div className="min-w-0 rounded-[8px] border border-border bg-bg px-3 py-3">
          <p className="text-[10px] font-mono text-muted">B</p>
          <p className="mt-1 text-[17px] font-semibold text-ink truncate">{pair?.labelB ?? '----'}</p>
        </div>
      </div>

      <div>
        <div className="flex items-end justify-between gap-4">
          <span className="text-[11px] font-mono text-muted">相関係数</span>
          <span className="text-[34px] leading-none font-semibold tracking-[-0.7px] tabular-nums" style={{ color: tone }}>
            {pair ? formatCorr(pair.corr) : '--'}
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-subtle overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: `${strength}%`, backgroundColor: tone }} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          +に近いほど同じ方向、-に近いほど逆方向に動きやすいペアです。
        </p>
      </div>
    </div>
  )
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[8px] border border-border bg-paper p-5">
      <h3 className="text-[15px] font-semibold tracking-[-0.2px] text-ink">{title}</h3>
      {children}
    </section>
  )
}

function FeatureCard({ view, index, title, desc, insight, useCase, accent, children, onNavigate, delay }: {
  view: View
  index: string
  title: string
  desc: string
  insight: string
  useCase: string
  accent: string
  children: ReactNode
  onNavigate: (view: View) => void
  delay: number
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(view)}
      className="group min-h-[360px] rounded-[8px] border border-border bg-paper text-left overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-muted hover:shadow-[0_18px_50px_rgba(0,0,0,0.12)]"
      style={{ animation: `fade-up 0.48s cubic-bezier(0.16,1,0.3,1) both ${delay}ms` }}
    >
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted truncate">{index}</p>
            <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.25px] text-ink truncate">{title}</h3>
          </div>
          <span
            className="h-9 w-9 rounded-[8px] flex items-center justify-center text-paper shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
            style={{ backgroundColor: accent }}
          >
            <ArrowIcon />
          </span>
        </div>
        <p className="px-5 pt-3 text-[12px] leading-relaxed text-muted">
          {desc}
        </p>
        <div className="min-h-[140px] flex items-center justify-center px-5 py-4">
          {children}
        </div>
        <div className="mt-auto border-t border-border px-5 py-4 grid gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted">分かること</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink">{insight}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted">使う場面</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink">{useCase}</p>
          </div>
        </div>
      </div>
    </button>
  )
}

export function HomeView({ onNavigate, sectors, correlation, health, period }: Props) {
  const { isDark } = useTheme()
  const stockCount = sectors.reduce((sum, sector) => sum + sector.stocks.length, 0)
  const previewSector = sectors.find(sector => sector.matrix.length >= 4) ?? sectors[0] ?? null
  const lastBatch = health?.last_batch
  const updatedAt = formatDateTime(lastBatch?.finished_at ?? lastBatch?.started_at)
  const pairCount = correlation ? correlation.stocks.length * (correlation.stocks.length - 1) / 2 : 0

  const pairSummaries = useMemo(() => {
    if (!correlation) return { positive: [] as PairSummary[], negative: [] as PairSummary[], strongestAbs: null as PairSummary | null }
    const pairs: PairSummary[] = []
    const { stocks, matrix } = correlation
    for (let i = 0; i < stocks.length; i++) {
      for (let j = i + 1; j < stocks.length; j++) {
        pairs.push({ labelA: stocks[i].label, labelB: stocks[j].label, corr: matrix[i][j] })
      }
    }
    const strongestAbs = pairs.slice().sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))[0] ?? null
    return {
      positive: pairs.slice().sort((a, b) => b.corr - a.corr).slice(0, 4),
      negative: pairs.slice().sort((a, b) => a.corr - b.corr).slice(0, 3),
      strongestAbs,
    }
  }, [correlation])

  const heroPair = pairSummaries.strongestAbs
  const heroStats = [
    { label: '銘柄数', value: stockCount || '-', hint: '分析対象の銘柄' },
    { label: 'セクター', value: sectors.length || '-', hint: '業種グループ' },
    { label: '期間', value: period, hint: `約${SESSION_ESTIMATE[period]}営業日` },
    { label: '更新', value: updatedAt, hint: '静的データの時刻' },
  ]

  const readingGuide = [
    { label: '+0.70 以上', color: ACCENTS.ranking, text: 'かなり同じ方向に動きやすい。代替候補や同時保有の偏りを確認。' },
    { label: '+0.30 から +0.70', color: ACCENTS.network, text: 'ゆるく連動。テーマや市況の影響を受けている可能性。' },
    { label: '-0.30 以下', color: '#ff4f5e', text: '逆方向に動きやすい。ヘッジ候補や分散候補として確認。' },
    { label: '0 付近', color: 'var(--color-muted)', text: '関係が薄い、または期間内では方向感が出ていない組み合わせ。' },
  ]

  const workflow = [
    ['1', 'トレンドで変化を見る', '最近つながりが強まった/弱まった銘柄ペアを先に拾います。'],
    ['2', 'ヒートマップで全体を見る', '色の固まりから、同じ方向に動く銘柄群とズレている銘柄を探します。'],
    ['3', 'ネットワークで関係を追う', '中心にいる銘柄やセクターをまたぐ連動を確認します。'],
    ['4', 'ランキングで候補を絞る', '高相関・低相関のペアを順位で見て、気になる組み合わせを拾います。'],
    ['5', 'チャートで値動きを確認する', '相関だけで判断せず、実際の価格推移とリターンを比較します。'],
  ] as const

  return (
    <div className="min-h-full w-full max-w-7xl mx-auto px-1 sm:px-2 lg:px-4 py-6 lg:py-8">
      <section
        className="relative overflow-hidden border-y border-border py-8 lg:py-10"
        style={{
          backgroundImage: 'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          backgroundPosition: '-1px -1px',
        }}
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] items-center">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 border border-border bg-paper/85 backdrop-blur px-3 h-8 rounded-full">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ACCENTS.heatmap }} />
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted">相関分析ダッシュボード</span>
            </div>

            <h1 className="mt-5 text-[44px] sm:text-[58px] lg:text-[72px] leading-[0.92] font-semibold tracking-[-1.4px] text-ink">
              Kaburela
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] sm:text-[16px] leading-7 text-muted">
              東証銘柄の「同じ方向に動きやすい」「逆方向に動きやすい」を可視化するツールです。
              セクター全体の傾向を掴み、気になる銘柄ペアを見つけ、最後にチャートで値動きを確認できます。
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ['全体像', 'セクター別の相関を色で俯瞰'],
                ['関係性', '強くつながる銘柄をネットワークで確認'],
                ['深掘り', 'ランキングとチャートで銘柄ペアを検証'],
              ].map(([label, text]) => (
                <div key={label} className="rounded-[8px] border border-border bg-paper/85 px-4 py-3">
                  <p className="text-[12px] font-semibold text-ink">{label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{text}</p>
                </div>
              ))}
            </div>

            <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {heroStats.map(stat => <StatPill key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />)}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('heatmap')}
                className="h-11 px-5 rounded-[8px] bg-ink text-paper text-[13px] font-semibold flex items-center gap-2 transition-transform hover:-translate-y-0.5"
              >
                まず全体を見る
                <ArrowIcon />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('ranking')}
                className="h-11 px-5 rounded-[8px] border border-border bg-paper text-[13px] font-semibold text-ink flex items-center gap-2 transition-colors hover:border-muted"
              >
                注目ペアを見る
                <ArrowIcon />
              </button>
            </div>
          </div>

          <div className="relative min-h-[380px] lg:min-h-[440px]">
            <div className="absolute right-0 top-0 w-[74%] max-w-[360px] border border-border bg-paper p-4 rounded-[8px] shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">相関マップ</span>
                <span className="text-[11px] font-mono text-ink tabular-nums">{period}</span>
              </div>
              <HeroSignalGrid correlation={correlation} isDark={isDark} />
            </div>

            <div className="absolute left-0 top-[108px] w-[70%] max-w-[330px] min-h-[230px] border border-border bg-paper p-5 rounded-[8px] shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
              <PairFocusPanel pair={heroPair} />
            </div>

            <div className="absolute right-2 bottom-0 w-[72%] max-w-[340px] border border-border bg-paper p-4 rounded-[8px] shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">セクター構成</span>
                <span className="text-[11px] font-mono text-ink tabular-nums">{sectors.length || '--'} セクター</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(sectors.length ? sectors.slice(0, 4) : [
                  { name: '自動車', color: ACCENTS.heatmap, stocks: [] },
                  { name: '電機', color: ACCENTS.network, stocks: [] },
                  { name: '銀行', color: ACCENTS.macro, stocks: [] },
                  { name: '小売', color: ACCENTS.ranking, stocks: [] },
                ]).map(sector => (
                  <div key={sector.name} className="min-w-0 rounded-[6px] border border-border px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-mono text-ink">{sector.name}</span>
                    </div>
                    <p className="mt-1 text-[10px] font-mono text-muted tabular-nums">{sector.stocks.length || '--'} 銘柄</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 lg:py-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <InfoPanel title="相関係数の読み方">
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {readingGuide.map(item => (
              <div key={item.label} className="rounded-[8px] border border-border bg-bg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[12px] font-mono font-semibold text-ink">{item.label}</span>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">{item.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            相関は因果関係ではありません。最初の発見には便利ですが、実際の価格推移、出来高、ニュース、決算などと合わせて確認してください。
          </p>
        </InfoPanel>

        <InfoPanel title="今のデータ要約">
          <div className="mt-4 grid gap-3">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
              <span className="text-[12px] text-muted">銘柄ペア数</span>
              <span className="text-[18px] font-semibold text-ink tabular-nums">{pairCount || '-'}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
              <span className="text-[12px] text-muted">最大相関ペア</span>
              <span className="text-[13px] font-mono text-ink truncate">{heroPair ? `${heroPair.labelA} / ${heroPair.labelB}` : '-'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[12px] text-muted">相関係数</span>
              <span className="text-[18px] font-semibold tabular-nums" style={{ color: heroPair && heroPair.corr < 0 ? '#ff4f5e' : ACCENTS.ranking }}>
                {heroPair ? formatCorr(heroPair.corr) : '-'}
              </span>
            </div>
          </div>
        </InfoPanel>
      </section>

      <section className="pb-8 lg:pb-10">
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Workflow</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.5px] text-ink">おすすめの分析順</h2>
          </div>
          <p className="max-w-xl text-[13px] leading-6 text-muted">
            相関の全体像から入り、関係性、候補抽出、価格確認の順に進むと迷いにくくなります。
          </p>
        </div>

        <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {workflow.map(([step, title, text]) => (
            <div key={step} className="rounded-[8px] border border-border bg-paper p-4">
              <span className="h-7 w-7 rounded-[7px] bg-ink text-paper text-[12px] font-mono flex items-center justify-center">{step}</span>
              <h3 className="mt-4 text-[14px] font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-8 lg:pb-10">
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Views</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.5px] text-ink">分析タブの使い分け</h2>
          </div>
          <p className="max-w-xl text-[13px] leading-6 text-muted">
            それぞれのタブは役割が違います。見たい粒度に合わせて切り替えてください。
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FeatureCard
            view="trend"
            index="01 / Trend"
            title="トレンド"
            desc="短期相関と長期相関を比較し、最近つながりが強まった/弱まった銘柄ペアを検知します。"
            insight="今まで目立たなかった連動、崩れ始めた関係、正負が反転したペアを見つけられます。"
            useCase="直近で市場の見え方が変わった銘柄を探したい時。"
            accent={ACCENTS.network}
            onNavigate={onNavigate}
            delay={0}
          >
            <TrendPreview pair={heroPair} />
          </FeatureCard>

          <FeatureCard
            view="heatmap"
            index="02 / Heatmap"
            title="ヒートマップ"
            desc="セクターごとに銘柄間の相関を色で表示します。緑は同じ方向、赤は逆方向、薄い色は関係が弱い組み合わせです。"
            insight="同じ業種の中でまとまって動く銘柄群、または同業なのに動きが違う銘柄を見つけられます。"
            useCase="まず市場全体を眺めたい時、セクター内の偏りを確認したい時。"
            accent={ACCENTS.heatmap}
            onNavigate={onNavigate}
            delay={70}
          >
            <div className="w-full max-w-[190px]">
              <MiniCorrGrid matrix={previewSector?.matrix ?? []} isDark={isDark} />
              <div className="mt-3 flex items-center gap-2 justify-center">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: previewSector?.color ?? ACCENTS.heatmap }} />
                <span className="text-[11px] font-mono text-muted truncate">{previewSector?.name ?? 'sector'}</span>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            view="network"
            index="03 / Network"
            title="ネットワーク"
            desc="相関が強い銘柄同士を線で結びます。線が多い銘柄ほど、他の銘柄と連動しやすい状態です。"
            insight="中心にいる銘柄、孤立している銘柄、セクターをまたいだ連動を視覚的に追えます。"
            useCase="銘柄同士のつながりを直感的に見たい時、テーマ株のまとまりを探したい時。"
            accent={ACCENTS.network}
            onNavigate={onNavigate}
            delay={140}
          >
            {correlation ? (
              <MiniNetworkSvg stocks={correlation.stocks} matrix={correlation.matrix} isDark={isDark} />
            ) : (
              <div className="h-32 w-full rounded-[8px] bg-subtle" />
            )}
          </FeatureCard>

          <FeatureCard
            view="macro"
            index="04 / Macro"
            title="マクロ"
            desc="為替、指数、金利、商品などの外部要因と、銘柄・セクターの連動を確認します。"
            insight="市場全体の風向きに対して、どのセクターや銘柄が反応しやすいかを見られます。"
            useCase="円安・金利・米国株・商品価格などの影響を整理したい時。"
            accent={ACCENTS.macro}
            onNavigate={onNavigate}
            delay={210}
          >
            <MacroPreview />
          </FeatureCard>

          <FeatureCard
            view="ranking"
            index="05 / Ranking"
            title="ランキング"
            desc="相関が高いペア、低いペアを順位で並べます。数字で候補を絞り込むためのタブです。"
            insight="同じように動くペア、逆に動きやすいペアを短時間で拾えます。"
            useCase="分散候補、比較候補、ペアトレード候補を探したい時。"
            accent={ACCENTS.ranking}
            onNavigate={onNavigate}
            delay={280}
          >
            <RankingPreview pairs={pairSummaries.positive.length ? pairSummaries.positive : pairSummaries.negative} />
          </FeatureCard>

          <FeatureCard
            view="chart"
            index="06 / Chart"
            title="チャート"
            desc="個別銘柄やセクター指数を並べて、価格推移とリターンを比較します。"
            insight="相関が高く見える理由が、同時期の上昇なのか、長期トレンドなのか、急落局面なのかを確認できます。"
            useCase="ヒートマップやランキングで見つけたペアを最後に検証したい時。"
            accent={ACCENTS.chart}
            onNavigate={onNavigate}
            delay={350}
          >
            <ChartPreview />
          </FeatureCard>
        </div>
      </section>
    </div>
  )
}
