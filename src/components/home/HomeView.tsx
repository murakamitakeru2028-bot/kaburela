import { useMemo, type ReactNode } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { corrToFill } from '../../lib/colorUtils'
import type { View } from '../layout/tabConfig'
import { LogoMark } from '../layout/LogoMark'
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
  return date.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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

function PosCorrMini() {
  return (
    <svg width="88" height="48" viewBox="0 0 88 48" fill="none" aria-hidden>
      <polyline points="4,44 20,36 36,26 52,18 68,10 84,4" stroke={ACCENTS.ranking} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="4,46 20,40 36,30 52,22 68,14 84,8" stroke={ACCENTS.network} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  )
}

function ZeroCorrMini() {
  return (
    <svg width="88" height="48" viewBox="0 0 88 48" fill="none" aria-hidden>
      <polyline points="4,44 20,36 36,26 52,18 68,10 84,4" stroke={ACCENTS.ranking} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="4,26 20,38 36,22 52,34 68,18 84,30" stroke={ACCENTS.network} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  )
}

function NegCorrMini() {
  return (
    <svg width="88" height="48" viewBox="0 0 88 48" fill="none" aria-hidden>
      <polyline points="4,44 20,36 36,26 52,18 68,10 84,4" stroke={ACCENTS.ranking} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="4,4 20,12 36,22 52,30 68,38 84,44" stroke="#ff4f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MiniCorrGrid({ matrix, isDark, limit = 6 }: { matrix: number[][]; isDark: boolean; limit?: number }) {
  const visible = matrix.slice(0, limit).map(row => row.slice(0, limit))
  if (!visible.length) return <div className="h-32 rounded-[8px] bg-subtle" />
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
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

function HeroSignalGrid({ correlation, isDark }: { correlation: CorrelationResponse | null; isDark: boolean }) {
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
          style={{ backgroundColor: corrToFill(value, isDark), animation: `cell-in 0.35s ease both ${((r * 9 + c) % 18) * 18}ms` }}
        />
      )))}
    </div>
  )
}

function MiniNetworkSvg({ stocks, matrix, isDark }: { stocks: CorrelationResponse['stocks']; matrix: number[][]; isDark: boolean }) {
  const n = Math.min(stocks.length, 14)
  const width = 280, height = 150, centerX = width / 2, centerY = height / 2, radius = 54
  const points = Array.from({ length: Math.max(n, 1) }, (_, i) => ({
    x: centerX + radius * Math.cos((Math.PI * 2 * i) / Math.max(n, 1) - Math.PI / 2),
    y: centerY + radius * Math.sin((Math.PI * 2 * i) / Math.max(n, 1) - Math.PI / 2),
  }))
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden>
      {Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
        if (j <= i) return null
        const corr = matrix[i]?.[j] ?? 0
        if (Math.abs(corr) < 0.55) return null
        return (
          <line key={`${i}-${j}`} x1={points[i].x} y1={points[i].y} x2={points[j].x} y2={points[j].y}
            stroke={corr >= 0 ? ACCENTS.ranking : '#ff4f5e'} strokeWidth={Math.max(1, Math.abs(corr) * 3)}
            strokeOpacity={isDark ? 0.7 : 0.48} strokeLinecap="round" />
        )
      }))}
      {points.slice(0, n).map((point, i) => (
        <circle key={i} cx={point.x} cy={point.y} r={6}
          fill={isDark ? '#1c1c1e' : '#ffffff'}
          stroke={i % 3 === 0 ? ACCENTS.heatmap : i % 3 === 1 ? ACCENTS.network : ACCENTS.macro}
          strokeWidth={1.6} />
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
            <span className="font-semibold tabular-nums" style={{ color: pair.corr >= 0 ? ACCENTS.ranking : '#ff4f5e' }}>{formatCorr(pair.corr)}</span>
          </div>
          <div className="ml-6 h-[3px] rounded-full bg-subtle overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(12, Math.min(100, Math.abs(pair.corr) * 100))}%`, backgroundColor: pair.corr >= 0 ? ACCENTS.ranking : '#ff4f5e' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartPreview() {
  return (
    <svg width="100%" height="140" viewBox="0 0 268 140" fill="none" aria-hidden>
      <path d="M8 112H260" stroke="var(--color-border)" strokeDasharray="4 5" />
      <path d="M8 76H260" stroke="var(--color-border)" strokeDasharray="4 5" />
      <path d="M8 40H260" stroke="var(--color-border)" strokeDasharray="4 5" />
      <polyline points="8,80 44,66 80,71 116,48 152,54 188,34 224,39 260,18" fill="none" stroke={ACCENTS.chart} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
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
          <span className="block h-full rounded-full" style={{ width: `${Math.max(8, Math.abs(before) * 100)}%`, backgroundColor: before >= 0 ? ACCENTS.ranking : '#ff4f5e', opacity: 0.48 }} />
        </span>
        <span className="text-[11px] font-mono font-semibold text-ink tabular-nums text-right">{formatCorr(before)}</span>
      </div>
      <div className="grid grid-cols-[58px_minmax(0,1fr)_54px] items-center gap-3">
        <span className="text-[11px] font-mono text-muted">短期</span>
        <span className="h-2 rounded-full bg-subtle overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: `${Math.max(8, Math.abs(after) * 100)}%`, backgroundColor: after >= 0 ? ACCENTS.ranking : '#ff4f5e', opacity: 0.86 }} />
        </span>
        <span className="text-[11px] font-mono font-semibold text-ink tabular-nums text-right">{formatCorr(after)}</span>
      </div>
      <div className="rounded-[8px] border border-border bg-bg px-3 py-2 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[11px] font-mono text-muted">{pair ? `${pair.labelA} / ${pair.labelB}` : '変化ペア'}</span>
        <span className="text-[13px] font-mono font-semibold tabular-nums" style={{ color: shift >= 0 ? ACCENTS.ranking : '#ff4f5e' }}>{shift >= 0 ? '+' : ''}{shift.toFixed(2)}</span>
      </div>
    </div>
  )
}

function MacroPreview() {
  const rows = [
    { label: 'USD/JPY', value: 72, color: ACCENTS.network },
    { label: 'NASDAQ', value: 56, color: ACCENTS.heatmap },
    { label: 'SOX', value: 68, color: '#7c3aed' },
    { label: 'VIX', value: 44, color: '#ff4f5e' },
    { label: 'WTI', value: 38, color: ACCENTS.macro },
    { label: 'US10Y', value: 64, color: ACCENTS.ranking },
  ]
  return (
    <div className="w-full space-y-3">
      {rows.map(row => (
        <div key={row.label} className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3">
          <span className="text-[11px] font-mono text-muted">{row.label}</span>
          <span className="h-2 rounded-full bg-subtle overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${row.value}%`, backgroundColor: row.color, opacity: 0.78 }} />
          </span>
        </div>
      ))}
    </div>
  )
}

function StatPill({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-border bg-paper/90 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted truncate">{label}</p>
      <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.3px] text-ink tabular-nums truncate">{value}</p>
      <p className="mt-1.5 text-[11px] text-muted truncate">{hint}</p>
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
        <div className="h-[34px] w-[34px] rounded-full flex items-center justify-center text-[12px] font-mono text-paper" style={{ backgroundColor: tone }}>/</div>
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
        <p className="mt-2 text-[11px] leading-relaxed text-muted">+に近いほど同じ方向、-に近いほど逆方向に動きやすいペアです。</p>
      </div>
    </div>
  )
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[8px] border border-border bg-paper p-5 sm:p-6 shadow-[0_12px_34px_rgba(0,0,0,0.04)]">
      <h3 className="text-[16px] font-semibold tracking-[-0.2px] text-ink">{title}</h3>
      {children}
    </section>
  )
}

function TipCard({ num, title, text, accent }: { num: number; title: string; text: string; accent: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-paper p-5 shadow-[0_10px_28px_rgba(0,0,0,0.04)]">
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[12px] font-mono font-semibold text-paper"
        style={{ backgroundColor: accent }}
      >{num}</span>
      <h4 className="mt-3 text-[14px] font-semibold text-ink">{title}</h4>
      <p className="mt-2 text-[12px] leading-[1.7] text-muted">{text}</p>
    </div>
  )
}

function FeatureCard({ view, index, title, desc, insight, useCase, accent, children, onNavigate, delay }: {
  view: View; index: string; title: string; desc: string; insight: string; useCase: string
  accent: string; children: ReactNode; onNavigate: (view: View) => void; delay: number
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(view)}
      className="group min-h-[390px] rounded-[8px] border border-border bg-paper text-left overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-muted hover:shadow-[0_22px_56px_rgba(0,0,0,0.12)]"
      style={{ animation: `fade-up 0.48s cubic-bezier(0.16,1,0.3,1) both ${delay}ms` }}
    >
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between gap-3 px-6 pt-6">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted truncate">{index}</p>
            <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.25px] text-ink truncate">{title}</h3>
          </div>
          <span className="h-9 w-9 rounded-[8px] flex items-center justify-center text-paper shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" style={{ backgroundColor: accent }}>
            <ArrowIcon />
          </span>
        </div>
        <p className="px-6 pt-4 text-[13px] leading-relaxed text-muted">{desc}</p>
        <div className="min-h-[150px] flex items-center justify-center px-6 py-6">{children}</div>
        <div className="mt-auto border-t border-border px-6 py-5 grid gap-4">
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
  const stockCount = sectors.reduce((sum, s) => sum + s.stocks.length, 0)
  const previewSector = sectors.find(s => s.matrix.length >= 4) ?? sectors[0] ?? null
  const lastBatch = health?.last_batch
  const updatedAt = formatDateTime(lastBatch?.finished_at ?? lastBatch?.started_at)
  const pairCount = correlation ? correlation.stocks.length * (correlation.stocks.length - 1) / 2 : 0

  const pairSummaries = useMemo(() => {
    if (!correlation) return { positive: [] as PairSummary[], negative: [] as PairSummary[], strongestAbs: null as PairSummary | null }
    const pairs: PairSummary[] = []
    const { stocks, matrix } = correlation
    for (let i = 0; i < stocks.length; i++)
      for (let j = i + 1; j < stocks.length; j++)
        pairs.push({ labelA: stocks[i].label, labelB: stocks[j].label, corr: matrix[i][j] })
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
    {
      label: '+0.70 以上', color: ACCENTS.ranking,
      text: 'かなり強く連動しています。ほぼ同じタイミングで上がり・下がりする傾向があります。同じ銘柄を複数保有しているような状態に近く、分散効果が薄れる可能性があります。',
    },
    {
      label: '+0.30 〜 +0.70', color: ACCENTS.network,
      text: '緩やかに連動しています。同じテーマ・業種・市況の影響を受けている可能性があります。相関の背景を把握したうえで、変化のサインとして活用できます。',
    },
    {
      label: '-0.30 以下', color: '#ff4f5e',
      text: '逆方向に動きやすい傾向があります。分散目的で組み合わせると効果が出やすいですが、両方保有すると互いの上昇を打ち消し合うリスクもあります。',
    },
    {
      label: '0 付近', color: 'var(--color-muted)',
      text: '明確な方向性がありません。別々の要因で動いているか、期間内でランダムに変動している状態です。期間を変えて確認する価値があります。',
    },
  ]

  const workflow = [
    { step: '1', title: 'トレンドで変化を見る', text: '最近つながりが強まった/弱まった銘柄ペアを先に拾います。', note: '短期と長期の差が大きいペアほど、最近関係性が変わったことを意味します。' },
    { step: '2', title: 'ヒートマップで全体を見る', text: '色の固まりから、同じ方向に動く銘柄群とズレている銘柄を探します。', note: 'セクター内で色が均一なら業界全体が動いており、孤立した色があれば個別事情の可能性があります。' },
    { step: '3', title: 'ネットワークで関係を追う', text: '中心にいる銘柄やセクターをまたぐ連動を確認します。', note: '線の多いハブ銘柄は市場全体の動きに敏感です。セクター外への接続はテーマ相場のサインになることも。' },
    { step: '4', title: 'ランキングで候補を絞る', text: '高相関・低相関のペアを順位で見て、気になる組み合わせを拾います。', note: '同業種で高相関なら代替候補に、異業種で高相関なら共通テーマを疑います。低相関ペアは分散候補として検討できます。' },
    { step: '5', title: 'チャートで値動きを確認する', text: '相関だけで判断せず、実際の価格推移とリターンを比較します。', note: '相関が高くても、価格水準・ボラティリティ・上昇開始時期は異なる場合があります。チャートで必ず確認してください。' },
  ]

  const tips = [
    { num: 1, accent: ACCENTS.chart, title: '相関は「因果関係」ではない', text: '2つの銘柄が同じ方向に動いていても、一方が原因とは限りません。背景には第三の要因（市場全体の動向、テーマ相場、マクロ指標など）があることが多いです。相関はあくまで「方向が似ている」という観察です。' },
    { num: 2, accent: ACCENTS.network, title: '計算期間によって大きく変わる', text: '長期では高相関でも、短期では無相関・逆相関になることがあります。トレンドタブでは短期・基準の2軸を比較できるため、「最近変わった関係性」を発見するのに活用してください。' },
    { num: 3, accent: ACCENTS.macro, title: '急落局面では相関が高まりやすい', text: '市場が急落する局面では、多くの銘柄が一斉に売られるため相関が通常より高く見えます（相関の収束）。高相関が一時的なパニック相場によるものか、構造的なものかを区別するために、複数の期間で確認することをおすすめします。' },
    { num: 4, accent: ACCENTS.heatmap, title: '複数の情報と組み合わせて判断する', text: '相関係数はあくまで一つの指標です。実際の価格推移・出来高・企業のファンダメンタルズ・ニュース・決算なども合わせて確認してください。相関が高くても、業績や財務の差が大きければ同等とは言えません。' },
  ]

  return (
    <div className="min-h-full w-full max-w-7xl mx-auto px-0 sm:px-4 lg:px-6 py-6 sm:py-8 lg:py-12">

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden border-y border-border py-10 sm:py-12 lg:py-16"
        style={{
          backgroundImage: 'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          backgroundPosition: '-1px -1px',
        }}
      >
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.04fr)_minmax(380px,0.96fr)] items-center">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-3 border border-border bg-paper/90 backdrop-blur px-4 py-3 rounded-[8px] shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
              <LogoMark size={34} className="shrink-0" />
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Correlation intelligence</p>
                <p className="mt-0.5 text-[15px] font-semibold tracking-[-0.25px] text-ink">Kaburela</p>
              </div>
            </div>

            <h1 className="mt-8 text-[42px] sm:text-[62px] lg:text-[76px] leading-[0.95] font-semibold tracking-[-1.4px] text-ink">
              Kaburela
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-8 text-muted">
              東証銘柄の「同じ方向に動きやすい」「逆方向に動きやすい」を可視化するツールです。
              セクター全体の傾向を掴み、気になる銘柄ペアを見つけ、最後にチャートで値動きを確認できます。
            </p>
            <p className="mt-3 max-w-2xl text-[14px] leading-7 text-muted">
              ポートフォリオの銘柄が偏っていないか確認したい時、分散候補や比較候補を探したい時の出発点として使ってください。
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                ['俯瞰', 'セクター別の相関を色で一覧。全体の偏りを素早く把握できます。'],
                ['発見', 'ネットワークとランキングで連動する銘柄ペアを特定します。'],
                ['検証', 'チャートで実際の価格推移とリターンを比較して確認できます。'],
              ].map(([label, text]) => (
                <div key={label} className="rounded-[8px] border border-border bg-paper/85 px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                  <p className="text-[12px] font-semibold text-ink">{label}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">{text}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {heroStats.map(stat => <StatPill key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />)}
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => onNavigate('heatmap')}
                className="h-11 px-5 rounded-[8px] bg-ink text-paper text-[13px] font-semibold flex items-center gap-2 transition-transform hover:-translate-y-0.5">
                まず全体を見る <ArrowIcon />
              </button>
              <button type="button" onClick={() => onNavigate('ranking')}
                className="h-11 px-5 rounded-[8px] border border-border bg-paper text-[13px] font-semibold text-ink flex items-center gap-2 transition-colors hover:border-muted">
                注目ペアを見る <ArrowIcon />
              </button>
            </div>
          </div>

          <div className="relative min-h-[430px] lg:min-h-[500px]">
            <div className="absolute right-0 top-0 w-[78%] max-w-[380px] border border-border bg-paper/95 p-5 rounded-[8px] shadow-[0_24px_60px_rgba(0,0,0,0.10)]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">相関マップ</span>
                <span className="text-[11px] font-mono text-ink tabular-nums">{period}</span>
              </div>
              <HeroSignalGrid correlation={correlation} isDark={isDark} />
            </div>
            <div className="absolute left-0 top-[128px] w-[72%] max-w-[350px] min-h-[240px] border border-border bg-paper/95 p-6 rounded-[8px] shadow-[0_24px_60px_rgba(0,0,0,0.10)]">
              <PairFocusPanel pair={heroPair} />
            </div>
            <div className="absolute right-2 bottom-0 w-[74%] max-w-[360px] border border-border bg-paper/95 p-5 rounded-[8px] shadow-[0_24px_60px_rgba(0,0,0,0.10)]">
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

      {/* ── 相関係数とは ── */}
      <section className="py-10 lg:py-14">
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">What is Correlation</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.5px] text-ink">相関係数とは</h2>
          </div>
          <p className="max-w-xl text-[13px] leading-6 text-muted">
            2つの銘柄がどれだけ「同じ方向に動きやすいか」を -1.0 から +1.0 の数値で表したものです。
          </p>
        </div>

        <div className="mt-8 rounded-[8px] border border-border bg-paper p-6 shadow-[0_12px_34px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] leading-[1.8] text-muted">
            Kaburela では、対象期間中の各銘柄の日次リターン（前日比変化率）をもとに、ピアソンの積率相関係数を計算しています。
            1日ごとの動きの方向と大きさが揃っているほど +1.0 に近づき、逆方向であるほど -1.0 に近づきます。
            0 に近い場合は、2つの銘柄が互いに独立して動いていることを示します。
          </p>

          <div className="mt-6 space-y-2">
            <div className="h-3 w-full rounded-full" style={{ background: 'linear-gradient(to right, #ff4f5e, #ff8870, #c0c0c0, #66e8a0, #00c878)' }} />
            <div className="flex justify-between text-[11px] font-mono text-muted">
              <span>-1.0</span><span>-0.5</span><span>0</span><span>+0.5</span><span>+1.0</span>
            </div>
            <div className="flex justify-between text-[11px] text-muted">
              <span>完全逆相関</span>
              <span className="text-center flex-1 text-center">無相関</span>
              <span>完全正相関</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[8px] border border-border bg-bg px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted">正の相関</p>
                  <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums" style={{ color: ACCENTS.ranking }}>+0.85</p>
                </div>
                <PosCorrMini />
              </div>
              <p className="mt-3 text-[12px] leading-[1.7] text-muted">
                2つの銘柄が似たタイミングで上がり・下がりする状態。同じ業種や同じテーマ株に多く見られます。
              </p>
            </div>
            <div className="rounded-[8px] border border-border bg-bg px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted">無相関</p>
                  <p className="mt-1 text-[22px] font-semibold leading-none text-muted tabular-nums">±0.05</p>
                </div>
                <ZeroCorrMini />
              </div>
              <p className="mt-3 text-[12px] leading-[1.7] text-muted">
                2つの銘柄の動きに明確な関係性がない状態。異なる要因で動いているか、影響が打ち消し合っています。
              </p>
            </div>
            <div className="rounded-[8px] border border-border bg-bg px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted">負の相関</p>
                  <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums" style={{ color: '#ff4f5e' }}>-0.78</p>
                </div>
                <NegCorrMini />
              </div>
              <p className="mt-3 text-[12px] leading-[1.7] text-muted">
                片方が上がる時に他方が下がりやすい状態。為替感応度が逆のセクター間などで見られることがあります。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 相関係数の読み方 + データ要約 ── */}
      <section className="pb-10 lg:pb-14 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)]">
        <InfoPanel title="相関係数の読み方">
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {readingGuide.map(item => (
              <div key={item.label} className="rounded-[8px] border border-border bg-bg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
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

      {/* ── おすすめの分析順 ── */}
      <section className="pb-10 lg:pb-14">
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Workflow</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.5px] text-ink">おすすめの分析順</h2>
          </div>
          <p className="max-w-xl text-[13px] leading-6 text-muted">
            相関の全体像から入り、関係性・候補抽出・価格確認の順に進むと迷いにくくなります。
          </p>
        </div>

        <div className="mt-8 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {workflow.map(({ step, title, text, note }) => (
            <div key={step} className="rounded-[8px] border border-border bg-paper p-5 shadow-[0_10px_28px_rgba(0,0,0,0.04)]">
              <span className="h-7 w-7 rounded-[7px] bg-ink text-paper text-[12px] font-mono flex items-center justify-center">{step}</span>
              <h3 className="mt-4 text-[14px] font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{text}</p>
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[11px] leading-[1.6] text-muted" style={{ opacity: 0.7 }}>{note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 分析タブの使い分け ── */}
      <section className="pb-10 lg:pb-14">
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Views</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.5px] text-ink">分析タブの使い分け</h2>
          </div>
          <p className="max-w-xl text-[13px] leading-6 text-muted">
            それぞれのタブは役割が違います。見たい粒度に合わせて切り替えてください。
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <FeatureCard view="trend" index="01 / Trend" title="トレンド"
            desc="短期相関と長期相関を比較し、最近つながりが強まった/弱まった銘柄ペアを検知します。今まで目立たなかった連動や、崩れ始めた関係性を素早く見つけるためのタブです。"
            insight="正負が反転したペア、急接近したペア、静かに離れていくペアをひとめで把握できます。"
            useCase="直近で市場の見え方が変わった銘柄を探したい時。トレンドの転換点を探したい時。"
            accent={ACCENTS.network} onNavigate={onNavigate} delay={0}>
            <TrendPreview pair={heroPair} />
          </FeatureCard>

          <FeatureCard view="heatmap" index="02 / Heatmap" title="ヒートマップ"
            desc="セクターごとに銘柄間の相関を色で表示します。緑は同じ方向、赤は逆方向、薄い色は関係が弱い組み合わせです。セクター内の偏りや異質な銘柄を視覚的に発見できます。"
            insight="同業種の中でまとまって動く銘柄群、または同業なのに動きが違う銘柄を見つけられます。"
            useCase="まず市場全体を眺めたい時。ポートフォリオが同セクター内でうまく分散できているか確認したい時。"
            accent={ACCENTS.heatmap} onNavigate={onNavigate} delay={70}>
            <div className="w-full max-w-[190px]">
              <MiniCorrGrid matrix={previewSector?.matrix ?? []} isDark={isDark} />
              <div className="mt-3 flex items-center gap-2 justify-center">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: previewSector?.color ?? ACCENTS.heatmap }} />
                <span className="text-[11px] font-mono text-muted truncate">{previewSector?.name ?? 'sector'}</span>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard view="network" index="03 / Network" title="ネットワーク"
            desc="相関が強い銘柄同士を線で結びます。線が多い銘柄ほど他の銘柄と連動しやすい状態です。セクターをまたいだ連動や、市場のハブ銘柄を視覚的に把握できます。"
            insight="中心にいる銘柄、孤立している銘柄、セクターをまたいだ連動を視覚的に追えます。"
            useCase="銘柄同士のつながりを直感的に見たい時。テーマ株のまとまりや孤立した銘柄を探したい時。"
            accent={ACCENTS.network} onNavigate={onNavigate} delay={140}>
            {correlation ? (
              <MiniNetworkSvg stocks={correlation.stocks} matrix={correlation.matrix} isDark={isDark} />
            ) : (
              <div className="h-32 w-full rounded-[8px] bg-subtle" />
            )}
          </FeatureCard>

          <FeatureCard view="macro" index="04 / Macro" title="マクロ"
            desc="為替・株価指数・金利・商品価格などの外部要因と、個別銘柄・セクターの連動を確認します。市場全体の風向きがどの銘柄に影響しているかを整理するためのタブです。"
            insight="円安局面で恩恵を受けやすいセクター、米国株との連動が強い銘柄などを整理できます。"
            useCase="円安・金利上昇・米国株下落などのマクロイベントが保有銘柄に与える影響を確認したい時。"
            accent={ACCENTS.macro} onNavigate={onNavigate} delay={210}>
            <MacroPreview />
          </FeatureCard>

          <FeatureCard view="ranking" index="05 / Ranking" title="ランキング"
            desc="全ペアの相関係数を高い順・低い順に並べます。数字で候補を絞り込むためのタブです。フィルター機能でセクターや銘柄を絞り込んで探すこともできます。"
            insight="同じように動くペア、逆に動きやすいペアを短時間で拾えます。組み合わせの優先順位をつけるのに役立ちます。"
            useCase="分散候補・比較候補・ペアトレード候補を数字で絞りたい時。特定銘柄との全組み合わせを一覧したい時。"
            accent={ACCENTS.ranking} onNavigate={onNavigate} delay={280}>
            <RankingPreview pairs={pairSummaries.positive.length ? pairSummaries.positive : pairSummaries.negative} />
          </FeatureCard>

          <FeatureCard view="chart" index="06 / Chart" title="チャート"
            desc="個別銘柄やセクター指数を並べて、価格推移とリターンを比較します。相関係数だけでなく、実際の値動きのパターン・タイミング・ボラティリティを確認するためのタブです。"
            insight="相関が高く見える理由が、同時期の上昇なのか、長期トレンドなのか、急落局面なのかを確認できます。"
            useCase="ヒートマップやランキングで見つけたペアを最後に検証したい時。価格の動き方の違いを比較したい時。"
            accent={ACCENTS.chart} onNavigate={onNavigate} delay={350}>
            <ChartPreview />
          </FeatureCard>
        </div>
      </section>

      {/* ── 使い方のコツ・注意点 ── */}
      <section className="pb-10 lg:pb-14">
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Tips & Notes</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.5px] text-ink">使い方のコツと注意点</h2>
          </div>
          <p className="max-w-xl text-[13px] leading-6 text-muted">
            相関係数は強力なツールですが、正しく使うためにいくつか押さえておきたい点があります。
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {tips.map(tip => (
            <TipCard key={tip.num} num={tip.num} title={tip.title} text={tip.text} accent={tip.accent} />
          ))}
        </div>

        <div className="mt-6 rounded-[8px] border border-border bg-subtle/50 px-6 py-5">
          <p className="text-[13px] font-semibold text-ink">投資の最終判断はご自身で</p>
          <p className="mt-2 text-[12px] leading-[1.8] text-muted">
            Kaburela は情報の整理と発見を支援するツールです。表示されるデータは特定の売買を推奨するものではありません。
            投資判断は必ず最新の情報と自己責任のもとで行ってください。
          </p>
        </div>
      </section>

    </div>
  )
}
