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
        <g key={index}>
          <circle
            cx={point.x}
            cy={point.y}
            r={6}
            fill={isDark ? '#1c1c1e' : '#ffffff'}
            stroke={index % 3 === 0 ? ACCENTS.heatmap : index % 3 === 1 ? ACCENTS.network : ACCENTS.macro}
            strokeWidth={1.6}
          />
        </g>
      ))}
    </svg>
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

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 border-y border-border py-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted truncate">{label}</p>
      <p className="mt-1 text-[20px] font-semibold tracking-[-0.3px] text-ink tabular-nums truncate">{value}</p>
    </div>
  )
}

function PairFocusPanel({ pair }: { pair: PairSummary | null }) {
  const tone = pair && pair.corr < 0 ? '#ff4f5e' : ACCENTS.ranking
  const strength = pair ? Math.max(10, Math.abs(pair.corr) * 100) : 24

  return (
    <div className="h-full flex flex-col justify-between gap-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Pair focus</span>
        <span className="text-[11px] font-mono text-muted">strongest</span>
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
          <span className="text-[11px] font-mono text-muted">correlation</span>
          <span className="text-[34px] leading-none font-semibold tracking-[-0.7px] tabular-nums" style={{ color: tone }}>
            {pair ? formatCorr(pair.corr) : '--'}
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-subtle overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: `${strength}%`, backgroundColor: tone }} />
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ view, kicker, title, desc, accent, children, onNavigate, delay }: {
  view: View
  kicker: string
  title: string
  desc: string
  accent: string
  children: ReactNode
  onNavigate: (view: View) => void
  delay: number
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(view)}
      className="group min-h-[300px] rounded-[8px] border border-border bg-paper text-left overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-muted hover:shadow-[0_18px_50px_rgba(0,0,0,0.12)]"
      style={{ animation: `fade-up 0.48s cubic-bezier(0.16,1,0.3,1) both ${delay}ms` }}
    >
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted truncate">{kicker}</p>
            <h3 className="mt-1 text-[18px] font-semibold tracking-[-0.2px] text-ink truncate">{title}</h3>
          </div>
          <span
            className="h-9 w-9 rounded-[8px] flex items-center justify-center text-paper shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
            style={{ backgroundColor: accent }}
          >
            <ArrowIcon />
          </span>
        </div>
        <div className="min-h-[150px] flex-1 flex items-center justify-center px-5 py-4">
          {children}
        </div>
        <p className="border-t border-border px-5 py-4 text-[12px] leading-relaxed text-muted">
          {desc}
        </p>
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
    { label: 'Universe', value: stockCount || '-' },
    { label: 'Sectors', value: sectors.length || '-' },
    { label: 'Window', value: period },
    { label: 'Updated', value: updatedAt },
  ]

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
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted">Market correlation cockpit</span>
            </div>

            <h1 className="mt-5 text-[44px] sm:text-[58px] lg:text-[72px] leading-[0.92] font-semibold tracking-[-1.4px] text-ink">
              Kaburela
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] sm:text-[16px] leading-7 text-muted">
              東証銘柄の「一緒に動く」「逆に動く」を、ヒートマップ、ネットワーク、ランキング、チャートで横断して読むための相関分析ツールです。
            </p>

            <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {heroStats.map(stat => <StatPill key={stat.label} label={stat.label} value={stat.value} />)}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('heatmap')}
                className="h-11 px-5 rounded-[8px] bg-ink text-paper text-[13px] font-semibold flex items-center gap-2 transition-transform hover:-translate-y-0.5"
              >
                相関を俯瞰する
                <ArrowIcon />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('chart')}
                className="h-11 px-5 rounded-[8px] border border-border bg-paper text-[13px] font-semibold text-ink flex items-center gap-2 transition-colors hover:border-muted"
              >
                銘柄を比較する
                <ArrowIcon />
              </button>
            </div>
          </div>

          <div className="relative min-h-[360px] lg:min-h-[430px]">
            <div className="absolute right-0 top-0 w-[74%] max-w-[360px] border border-border bg-paper p-4 rounded-[8px] shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Signal map</span>
                <span className="text-[11px] font-mono text-ink tabular-nums">{period}</span>
              </div>
              <HeroSignalGrid correlation={correlation} isDark={isDark} />
            </div>

            <div className="absolute left-0 top-[108px] w-[70%] max-w-[330px] min-h-[220px] border border-border bg-paper p-5 rounded-[8px] shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
              <PairFocusPanel pair={heroPair} />
            </div>

            <div className="absolute right-2 bottom-0 w-[72%] max-w-[340px] border border-border bg-paper p-4 rounded-[8px] shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Sector mix</span>
                <span className="text-[11px] font-mono text-ink tabular-nums">{sectors.length || '--'} groups</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(sectors.length ? sectors.slice(0, 4) : [
                  { name: 'Auto', color: ACCENTS.heatmap, stocks: [] },
                  { name: 'Tech', color: ACCENTS.network, stocks: [] },
                  { name: 'Bank', color: ACCENTS.macro, stocks: [] },
                  { name: 'Retail', color: ACCENTS.ranking, stocks: [] },
                ]).map(sector => (
                  <div key={sector.name} className="min-w-0 rounded-[6px] border border-border px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-mono text-ink">{sector.name}</span>
                    </div>
                    <p className="mt-1 text-[10px] font-mono text-muted tabular-nums">{sector.stocks.length || '--'} stocks</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 lg:py-10">
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Views</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.5px] text-ink">分析タブの使い分け</h2>
          </div>
          <p className="max-w-xl text-[13px] leading-6 text-muted">
            ざっくり俯瞰したい時、関係性を追いたい時、個別銘柄を深掘りしたい時で見る場所を切り替えられます。
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FeatureCard
            view="heatmap"
            kicker="01 / Sector Texture"
            title="ヒートマップ"
            desc="セクターごとに銘柄間の相関を色で表示します。まとまって動く銘柄群や、同じ業種内でズレている銘柄を見つける入口です。"
            accent={ACCENTS.heatmap}
            onNavigate={onNavigate}
            delay={0}
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
            kicker="02 / Relationship Graph"
            title="ネットワーク"
            desc="相関が強い銘柄同士を線で結びます。中心になっている銘柄、孤立している銘柄、セクターをまたぐ連動を直感的に追えます。"
            accent={ACCENTS.network}
            onNavigate={onNavigate}
            delay={70}
          >
            {correlation ? (
              <MiniNetworkSvg stocks={correlation.stocks} matrix={correlation.matrix} isDark={isDark} />
            ) : (
              <div className="h-32 w-full rounded-[8px] bg-subtle" />
            )}
          </FeatureCard>

          <FeatureCard
            view="macro"
            kicker="03 / Macro Link"
            title="マクロ"
            desc="為替、指数、金利、商品などの外部要因とセクター・銘柄の連動を見ます。市場全体の風向きを確認するためのタブです。"
            accent={ACCENTS.macro}
            onNavigate={onNavigate}
            delay={140}
          >
            <MacroPreview />
          </FeatureCard>

          <FeatureCard
            view="ranking"
            kicker="04 / Pair Ranking"
            title="ランキング"
            desc="相関が高い組み合わせ、低い組み合わせを順位で並べます。分散候補や同時に動きやすいペアを素早く拾えます。"
            accent={ACCENTS.ranking}
            onNavigate={onNavigate}
            delay={210}
          >
            <RankingPreview pairs={pairSummaries.positive.length ? pairSummaries.positive : pairSummaries.negative} />
          </FeatureCard>

          <FeatureCard
            view="chart"
            kicker="05 / Price Compare"
            title="チャート"
            desc="個別銘柄やセクター指数を並べて、価格推移とリターンを比較します。ヒートマップやランキングから掘り下げる先です。"
            accent={ACCENTS.chart}
            onNavigate={onNavigate}
            delay={280}
          >
            <ChartPreview />
          </FeatureCard>
        </div>
      </section>
    </div>
  )
}
