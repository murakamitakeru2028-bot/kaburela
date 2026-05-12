import { useMemo, useState } from 'react'
import { MiniHeatmap } from './MiniHeatmap'
import { Heatmap } from './Heatmap'
import { hexToRgba } from '../../lib/colorUtils'
import type { SectorData } from '../../lib/api'
import type { StockInfo } from '../../types/stock'

interface Props {
  sectors: SectorData[]
  minCorr: number
  onStockSelect: (stock: StockInfo) => void
}

function avgAbsCorr(matrix: number[][]): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < matrix.length; i++)
    for (let j = i + 1; j < matrix.length; j++) {
      sum += Math.abs(matrix[i][j])
      count++
    }
  return count > 0 ? sum / count : 0
}

function topPair(stocks: SectorData['stocks'], matrix: number[][]): { stockA: StockInfo; stockB: StockInfo; corr: number } {
  let best = { i: 0, j: 1, corr: -Infinity }
  for (let i = 0; i < matrix.length; i++)
    for (let j = i + 1; j < matrix.length; j++)
      if (matrix[i][j] > best.corr) best = { i, j, corr: matrix[i][j] }
  return { stockA: stocks[best.i], stockB: stocks[best.j], corr: best.corr }
}

interface PairInsight {
  stockA: StockInfo
  stockB: StockInfo
  corr: number
}

interface SectorStats {
  avgAbs: number
  avgSigned: number
  pairCount: number
  strongPairCount: number
  positiveCount: number
  negativeCount: number
  topPositive: PairInsight | null
  topNegative: PairInsight | null
}

interface SectorNarrative {
  description: string
  drivers: string[]
}

const DEFAULT_SECTOR_NARRATIVE: SectorNarrative = {
  description: 'このセクター内の銘柄がどれくらい同じ方向に動きやすいかを、相関のまとまりから確認できます。',
  drivers: ['業績テーマ', '金利・為替', '市場センチメント'],
}

const SECTOR_NARRATIVES: Record<string, SectorNarrative> = {
  '電気機器': {
    description: '半導体、FA、電子部品、総合電機などを含み、グローバル需要や円相場、設備投資サイクルの影響を受けやすいセクターです。',
    drivers: ['半導体市況', '円相場', '設備投資', '海外景気'],
  },
  '半導体関連': {
    description: '製造装置、材料、電子部品を中心に、生成AI投資やSOX指数、メモリ・ロジック需要との連動が出やすいグループです。',
    drivers: ['SOX指数', 'AI投資', '設備投資', '米ハイテク株'],
  },
  '輸送用機器': {
    description: '自動車メーカーと部品株が中心で、為替、販売台数、EVシフト、サプライチェーンの変化が相関に出やすいセクターです。',
    drivers: ['ドル円', '販売台数', 'EVシフト', '原材料価格'],
  },
  '銀行業': {
    description: 'メガバンクと地銀系を含み、国内外の金利、利ざや、景気見通しに反応しやすい金融セクターです。',
    drivers: ['日米金利', '利ざや', '景気感', '信用コスト'],
  },
  '卸売業（総合商社）': {
    description: '資源、食料、機械、インフラ投資など事業領域が広く、商品市況と株主還元期待の両方が効きやすいセクターです。',
    drivers: ['資源価格', '円相場', '株主還元', '海外投資'],
  },
  '保険業': {
    description: '損保・生保を中心に、金利上昇メリット、政策保有株、災害リスク、資本政策が株価の動きに影響します。',
    drivers: ['長期金利', '政策保有株', '災害リスク', '資本政策'],
  },
  '海運業': {
    description: 'コンテナ・ドライバルク・エネルギー輸送の市況に左右され、運賃指数や世界貿易量に敏感な循環色の強いセクターです。',
    drivers: ['運賃市況', '世界貿易', '燃料価格', '為替'],
  },
  '陸運業': {
    description: '鉄道、物流、宅配を含み、国内消費、インバウンド、人流、燃料費の影響を受けやすいディフェンシブ寄りのセクターです。',
    drivers: ['人流', 'インバウンド', '燃料費', '国内消費'],
  },
  '証券業': {
    description: '市場売買代金、株式相場、IPO・投信販売、金利環境に影響されやすく、リスクオン局面で連動が高まりやすいセクターです。',
    drivers: ['売買代金', '株式相場', 'IPO', '金利'],
  },
  '情報・通信業': {
    description: '通信キャリア、ネットサービス、投資会社を含み、ディフェンシブ性とグロース感応度が混ざるセクターです。',
    drivers: ['通信収益', '広告市場', '成長株', '投資先評価'],
  },
  '医薬品': {
    description: '大型薬、パイプライン、薬価、為替の影響が大きく、景気循環とは別の材料で動くことも多いセクターです。',
    drivers: ['新薬開発', '薬価', '為替', '防衛性'],
  },
  '食料品': {
    description: '食品・飲料・たばこを含み、原材料価格、値上げ浸透、国内消費、防衛性が相関の背景になりやすいセクターです。',
    drivers: ['原材料価格', '値上げ', '国内消費', '防衛性'],
  },
  '化学': {
    description: '素材、電子材料、日用品素材など幅が広く、原油・ナフサ価格、半導体需要、海外景気に左右されます。',
    drivers: ['原油・ナフサ', '電子材料', '海外景気', '為替'],
  },
  '機械': {
    description: '建機、FA、空調、重工など設備投資に近い銘柄が多く、世界景気と受注サイクルの影響が出やすいセクターです。',
    drivers: ['設備投資', '中国景気', '受注', '為替'],
  },
  '小売業': {
    description: 'コンビニ、総合小売、専門店を含み、国内消費、客数、値上げ、インバウンドの影響を受けやすいセクターです。',
    drivers: ['国内消費', '客数', '値上げ', 'インバウンド'],
  },
  '不動産業': {
    description: 'オフィス、住宅、REIT周辺の期待を含み、金利、地価、賃料、都市再開発のテーマに反応しやすいセクターです。',
    drivers: ['金利', '地価', '賃料', '再開発'],
  },
  '電気・ガス業': {
    description: '電力・ガスの公益系で、燃料価格、規制、需給、配当安定性が株価の共通要因になりやすいセクターです。',
    drivers: ['燃料価格', '規制', '電力需給', '配当'],
  },
  '建設業': {
    description: 'ゼネコンと住宅系を含み、公共投資、民間建設需要、資材価格、金利の影響を受けやすいセクターです。',
    drivers: ['公共投資', '建設需要', '資材価格', '金利'],
  },
}

function sectorNarrative(name: string): SectorNarrative {
  return SECTOR_NARRATIVES[name] ?? DEFAULT_SECTOR_NARRATIVE
}

function corrLabel(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

function corrTone(value: number): 'pos' | 'neg' | undefined {
  if (value > 0) return 'pos'
  if (value < 0) return 'neg'
  return undefined
}

function buildSectorStats(stocks: SectorData['stocks'], matrix: number[][]): SectorStats {
  let absSum = 0
  let signedSum = 0
  let pairCount = 0
  let strongPairCount = 0
  let positiveCount = 0
  let negativeCount = 0
  let topPositive: PairInsight | null = null
  let topNegative: PairInsight | null = null

  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      const corr = matrix[i]?.[j]
      const stockA = stocks[i]
      const stockB = stocks[j]
      if (corr == null || !stockA || !stockB) continue

      pairCount++
      absSum += Math.abs(corr)
      signedSum += corr
      if (Math.abs(corr) >= 0.6) strongPairCount++
      if (corr >= 0) positiveCount++
      else negativeCount++

      const pair = { stockA, stockB, corr }
      if (!topPositive || corr > topPositive.corr) topPositive = pair
      if (!topNegative || corr < topNegative.corr) topNegative = pair
    }
  }

  return {
    avgAbs: pairCount ? absSum / pairCount : 0,
    avgSigned: pairCount ? signedSum / pairCount : 0,
    pairCount,
    strongPairCount,
    positiveCount,
    negativeCount,
    topPositive,
    topNegative,
  }
}

interface SectorCardProps {
  sector: SectorData
  minCorr: number
  index: number
  onClick: () => void
  onStockSelect: (stock: StockInfo) => void
}

function SectorCard({ sector, minCorr, index, onClick, onStockSelect }: SectorCardProps) {
  const avg = useMemo(() => avgAbsCorr(sector.matrix), [sector.matrix])
  const top = useMemo(() => topPair(sector.stocks, sector.matrix), [sector])

  return (
    <div
      onClick={onClick}
      className="bg-paper rounded-[8px] overflow-hidden cursor-pointer shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-shadow duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]"
      style={{
        border: `1.5px solid ${hexToRgba(sector.color, 0.32)}`,
        animation: 'fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        animationDelay: `${index * 65}ms`,
      }}
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-3 pb-2 sm:px-4 sm:pt-4 sm:pb-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
          <span className="min-w-0 truncate text-[13px] font-semibold text-ink tracking-[-0.2px]">{sector.name}</span>
        </div>
        <span className="text-[11px] text-muted font-mono tabular-nums">{sector.stocks.length} 銘柄</span>
      </div>

      <div className="px-3 pb-3 sm:px-4">
        <MiniHeatmap
          stocks={sector.stocks}
          matrix={sector.matrix}
          minCorr={minCorr}
          enterDelay={index * 65 + 120}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4 border-t border-border">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted font-mono">平均相関</span>
          <span className="text-[12px] font-semibold font-mono tabular-nums" style={{ color: 'var(--color-pos)' }}>
            +{avg.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted font-mono">最高</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStockSelect(top.stockA)
            }}
            className="text-[10px] text-muted hover:text-ink font-mono cursor-pointer truncate max-w-[72px]"
          >
            {top.stockA.label}
          </button>
          <span className="text-[10px] text-muted font-mono">×</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStockSelect(top.stockB)
            }}
            className="text-[10px] text-muted hover:text-ink font-mono cursor-pointer truncate max-w-[72px]"
          >
            {top.stockB.label}
          </button>
          <span className="text-[12px] font-semibold font-mono tabular-nums" style={{ color: 'var(--color-pos)' }}>
            +{top.corr.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}

interface DetailViewProps {
  sector: SectorData
  sectors: SectorData[]
  onBack: () => void
  onStockSelect: (stock: StockInfo) => void
}

function MetricColumn({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? 'var(--color-pos)' : tone === 'neg' ? 'var(--color-neg)' : undefined
  return (
    <div className="flex flex-col justify-center px-4 py-2.5 border-r border-border last:border-r-0 min-w-[90px]">
      <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase leading-none">{label}</p>
      <p className="mt-1.5 text-[16px] font-semibold font-mono tabular-nums leading-none" style={{ color }}>{value}</p>
    </div>
  )
}

function DetailInfoPanel({
  sector,
  sectors,
  stats,
  narrative,
  onStockSelect,
}: {
  sector: SectorData
  sectors: SectorData[]
  stats: SectorStats
  narrative: SectorNarrative
  onStockSelect: (stock: StockInfo) => void
}) {
  const comparison = useMemo(() => {
    const avgs = sectors.map(s => avgAbsCorr(s.matrix))
    const sorted = [...avgs].sort((a, b) => b - a)
    const rank = sorted.findIndex(v => v <= stats.avgAbs + 0.0001) + 1
    const globalAvg = avgs.reduce((s, v) => s + v, 0) / avgs.length
    const min = Math.min(...avgs)
    const max = Math.max(...avgs)
    const pct = max > min ? ((stats.avgAbs - min) / (max - min)) * 100 : 50
    return { rank, total: sectors.length, globalAvg, diff: stats.avgAbs - globalAvg, pct }
  }, [sectors, stats.avgAbs])

  return (
    <div className="flex flex-col gap-5">
      {/* プロフィール */}
      <div>
        <p className="text-[11px] text-muted font-mono tracking-[0.08em] uppercase mb-1.5">Profile</p>
        <p className="text-[13px] leading-relaxed text-muted">{narrative.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {narrative.drivers.map(d => (
            <span key={d} className="px-2 py-0.5 rounded-full border border-border text-[12px] text-muted">{d}</span>
          ))}
        </div>
      </div>

      {/* 最強・最弱ペア */}
      {stats.topPositive && (
        <div>
          <p className="text-[11px] text-muted font-mono tracking-[0.08em] uppercase mb-2">相関ペア</p>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-[13px] font-mono min-w-0">
              <button type="button" onClick={() => onStockSelect(stats.topPositive!.stockA)} className="text-ink hover:text-muted cursor-pointer transition-colors truncate">{stats.topPositive.stockA.label}</button>
              <span className="text-muted/40 shrink-0">×</span>
              <button type="button" onClick={() => onStockSelect(stats.topPositive!.stockB)} className="text-ink hover:text-muted cursor-pointer transition-colors truncate">{stats.topPositive.stockB.label}</button>
            </div>
            <span className="text-[15px] font-semibold font-mono tabular-nums shrink-0 ml-2" style={{ color: 'var(--color-pos)' }}>{corrLabel(stats.topPositive.corr)}</span>
          </div>
          {stats.topNegative && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] font-mono text-muted min-w-0">
                <button type="button" onClick={() => onStockSelect(stats.topNegative!.stockA)} className="hover:text-ink cursor-pointer transition-colors truncate">{stats.topNegative.stockA.label}</button>
                <span className="text-muted/40 shrink-0">×</span>
                <button type="button" onClick={() => onStockSelect(stats.topNegative!.stockB)} className="hover:text-ink cursor-pointer transition-colors truncate">{stats.topNegative.stockB.label}</button>
              </div>
              <span className="text-[13px] font-semibold font-mono tabular-nums shrink-0 ml-2" style={{ color: 'var(--color-neg)' }}>{corrLabel(stats.topNegative.corr)}</span>
            </div>
          )}
        </div>
      )}

      {/* セクター比較 */}
      <div>
        <p className="text-[11px] text-muted font-mono tracking-[0.08em] uppercase mb-2">セクター比較</p>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-[22px] font-bold font-mono tabular-nums leading-none" style={{ color: sector.color }}>{comparison.rank}</span>
          <span className="text-[13px] text-muted">位 / {comparison.total}セクター</span>
        </div>
        <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-subtle)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${comparison.pct}%`, backgroundColor: sector.color }} />
        </div>
        <div className="flex justify-between mt-1 text-[11px] text-muted font-mono">
          <span>弱い</span><span>強い</span>
        </div>
        <p className="mt-1.5 text-[12px] text-muted">
          全体平均 <span className="font-mono font-semibold text-ink">{comparison.globalAvg.toFixed(2)}</span> より{' '}
          <span className="font-mono font-semibold" style={{ color: comparison.diff >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}>
            {comparison.diff >= 0 ? '+' : ''}{comparison.diff.toFixed(2)}
          </span>
        </p>
      </div>

      {/* メンバー */}
      <div>
        <p className="text-[11px] text-muted font-mono tracking-[0.08em] uppercase mb-2">Members</p>
        <div className="flex flex-wrap gap-1.5">
          {sector.stocks.map(stock => (
            <button
              key={stock.code}
              type="button"
              onClick={() => onStockSelect(stock)}
              className="h-7 px-2.5 rounded-full border border-border text-[12px] text-muted hover:text-ink hover:border-muted transition-colors cursor-pointer"
              title={`${stock.name} (${stock.code})`}
            >
              {stock.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectorDetailView({ sector, sectors, onBack, onStockSelect }: DetailViewProps) {
  const stats = useMemo(() => buildSectorStats(sector.stocks, sector.matrix), [sector.stocks, sector.matrix])
  const narrative = sectorNarrative(sector.name)
  const positiveRatio = stats.pairCount ? Math.round((stats.positiveCount / stats.pairCount) * 100) : 0

  return (
    <div
      className="h-full min-h-0 flex flex-col"
      style={{ animation: 'fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      {/* ヘッダー + 統計バー */}
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-2.5 px-4 py-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-muted hover:text-ink transition-colors cursor-pointer text-[13px]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            一覧に戻る
          </button>
          <span className="text-muted/40 text-[13px]">/</span>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
          <span className="text-[15px] font-semibold text-ink tracking-[-0.3px]">{sector.name}</span>
          <span className="text-[12px] text-muted">{sector.stocks.length} 銘柄</span>
        </div>
        <div className="border-t border-border overflow-x-auto">
          <div className="flex min-w-max">
            <MetricColumn label="平均相関" value={stats.avgAbs.toFixed(2)} tone="pos" />
            <MetricColumn label="相関バイアス" value={corrLabel(stats.avgSigned)} tone={corrTone(stats.avgSigned)} />
            <MetricColumn label="強いペア" value={`${stats.strongPairCount} / ${stats.pairCount}`} />
            <MetricColumn label="正相関比率" value={`${positiveRatio}%`} />
          </div>
        </div>
      </div>

      {/* 情報パネル + ヒートマップ (中央寄せ) */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex items-start justify-center gap-6 p-4 sm:p-6">
          <div className="hidden md:flex flex-col gap-4 w-[200px] lg:w-[220px] shrink-0 pt-1">
            <DetailInfoPanel
              sector={sector}
              sectors={sectors}
              stats={stats}
              narrative={narrative}
              onStockSelect={onStockSelect}
            />
          </div>
          <Heatmap stocks={sector.stocks} matrix={sector.matrix} onStockSelect={onStockSelect} />
        </div>
      </div>
    </div>
  )
}

export function SectorHeatmaps({ sectors, minCorr, onStockSelect }: Props) {
  const [selected, setSelected] = useState<SectorData | null>(null)

  if (selected) {
    return <SectorDetailView sector={selected} sectors={sectors} onBack={() => setSelected(null)} onStockSelect={onStockSelect} />
  }

  return (
    <div className="p-2 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {sectors.map((sector, i) => (
          <SectorCard
            key={sector.name}
            sector={sector}
            minCorr={minCorr}
            index={i}
            onClick={() => setSelected(sector)}
            onStockSelect={onStockSelect}
          />
        ))}
      </div>
    </div>
  )
}
