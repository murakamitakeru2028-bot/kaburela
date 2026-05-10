import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { hexToRgba } from '../../lib/colorUtils'
import type { CorrelationResponse, SectorData } from '../../lib/api'
import type { StockInfo } from '../../types/stock'

interface Props {
  sectors: SectorData[]
  correlation: CorrelationResponse | null
  minCorr: number
  onStockSelect: (stock: StockInfo) => void
}

type Mode = 'cross' | 'inside'
type Sign = 'all' | 'pos' | 'neg'
type SortMode = 'strength' | 'highest' | 'lowest' | 'name'

interface Pair {
  stockA: StockInfo
  stockB: StockInfo
  corr: number
}

interface SectorRanking {
  sector: SectorData
  pairs: Pair[]
  total: number
}

interface CrossSectorPair extends Pair {
  sectorA: SectorData
  sectorB: SectorData
}

interface PairRanking<T extends Pair> {
  pairs: T[]
  total: number
}

const MAX_CROSS_ROWS = 30
const MAX_SECTOR_ROWS = 18

function corrLabel(corr: number): string {
  return `${corr >= 0 ? '+' : ''}${corr.toFixed(2)}`
}

function signLabel(sign: Sign): string {
  if (sign === 'pos') return '正相関'
  if (sign === 'neg') return '逆相関'
  return 'すべて'
}

function toneLabel(corr: number): string {
  return corr >= 0 ? '正相関' : '逆相関'
}

function sortLabel(sort: SortMode): string {
  if (sort === 'highest') return '相関値 高い順'
  if (sort === 'lowest') return '相関値 低い順'
  if (sort === 'name') return '銘柄名順'
  return '強さ順'
}

function pairMatchesSign(corr: number, sign: Sign): boolean {
  if (sign === 'pos') return corr >= 0
  if (sign === 'neg') return corr < 0
  return true
}

function corrColor(corr: number): string {
  return corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'
}

function pairName(pair: Pair): string {
  return `${pair.stockA.label}${pair.stockB.label}${pair.stockA.code}${pair.stockB.code}`
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

function stockMatches(stock: StockInfo, query: string): boolean {
  if (!query) return true
  return [stock.code, stock.name, stock.label].some(value => value.toLowerCase().includes(query))
}

function pairMatchesQuery(pair: Pair, query: string): boolean {
  if (!query) return true
  return stockMatches(pair.stockA, query) || stockMatches(pair.stockB, query)
}

function crossPairMatchesQuery(pair: CrossSectorPair, query: string): boolean {
  if (!query) return true
  return pairMatchesQuery(pair, query) ||
    pair.sectorA.name.toLowerCase().includes(query) ||
    pair.sectorB.name.toLowerCase().includes(query)
}

function comparePairs(a: Pair, b: Pair, sort: SortMode): number {
  if (sort === 'highest') return b.corr - a.corr
  if (sort === 'lowest') return a.corr - b.corr
  if (sort === 'name') return pairName(a).localeCompare(pairName(b), 'ja')
  return Math.abs(b.corr) - Math.abs(a.corr)
}

function addTopPair<T extends Pair>(pairs: T[], pair: T, limit: number, sort: SortMode) {
  if (pairs.length >= limit && comparePairs(pair, pairs[pairs.length - 1], sort) >= 0) return

  const insertAt = pairs.findIndex(item => comparePairs(pair, item, sort) < 0)
  pairs.splice(insertAt === -1 ? pairs.length : insertAt, 0, pair)
  if (pairs.length > limit) pairs.pop()
}

function buildSectorPairs(sector: SectorData, minCorr: number, sign: Sign, query: string, sort: SortMode): PairRanking<Pair> {
  const pairs: Pair[] = []
  let total = 0

  for (let i = 0; i < sector.stocks.length; i++) {
    for (let j = i + 1; j < sector.stocks.length; j++) {
      const corr = sector.matrix[i]?.[j]
      if (corr == null || Math.abs(corr) < minCorr || !pairMatchesSign(corr, sign)) continue
      const pair = { stockA: sector.stocks[i], stockB: sector.stocks[j], corr }
      if (!pairMatchesQuery(pair, query)) continue
      total++
      addTopPair(pairs, pair, MAX_SECTOR_ROWS, sort)
    }
  }

  return { pairs, total }
}

function buildSectorRankings(
  sectors: SectorData[],
  minCorr: number,
  sign: Sign,
  query: string,
  sectorFilter: string,
  sort: SortMode,
): SectorRanking[] {
  return sectors.map(sector => {
    if (sectorFilter !== 'all' && sector.name !== sectorFilter) {
      return { sector, pairs: [], total: 0 }
    }
    const ranking = buildSectorPairs(sector, minCorr, sign, query, sort)
    return {
      sector,
      pairs: ranking.pairs,
      total: ranking.total,
    }
  })
}

function buildCrossSectorPairs(
  sectors: SectorData[],
  correlation: CorrelationResponse | null,
  minCorr: number,
  sign: Sign,
  query: string,
  sectorFilter: string,
  sort: SortMode,
): PairRanking<CrossSectorPair> {
  if (!correlation) return { pairs: [], total: 0 }

  const indexByCode = new Map(correlation.stocks.map((stock, index) => [stock.code, index]))
  const pairs: CrossSectorPair[] = []
  let total = 0

  for (let a = 0; a < sectors.length; a++) {
    for (let b = a + 1; b < sectors.length; b++) {
      const sectorA = sectors[a]
      const sectorB = sectors[b]
      if (sectorFilter !== 'all' && sectorA.name !== sectorFilter && sectorB.name !== sectorFilter) continue

      for (const stockA of sectorA.stocks) {
        const rowIndex = indexByCode.get(stockA.code)
        if (rowIndex == null) continue

        for (const stockB of sectorB.stocks) {
          const colIndex = indexByCode.get(stockB.code)
          if (colIndex == null) continue

          const corr = correlation.matrix[rowIndex]?.[colIndex]
          if (corr == null || Math.abs(corr) < minCorr || !pairMatchesSign(corr, sign)) continue
          const pair = { stockA, stockB, corr, sectorA, sectorB }
          if (!crossPairMatchesQuery(pair, query)) continue
          total++
          addTopPair(pairs, pair, MAX_CROSS_ROWS, sort)
        }
      }
    }
  }

  return { pairs, total }
}

export function RankingView({ sectors, correlation, minCorr, onStockSelect }: Props) {
  const [mode, setMode] = useState<Mode>('cross')
  const [sign, setSign] = useState<Sign>('all')
  const [sort, setSort] = useState<SortMode>('strength')
  const [query, setQuery] = useState('')
  const [sectorFilter, setSectorFilter] = useState('all')
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const normalizedQuery = normalizeQuery(query)

  const crossRanking = useMemo(
    () => buildCrossSectorPairs(sectors, correlation, minCorr, sign, normalizedQuery, sectorFilter, sort),
    [sectors, correlation, minCorr, sign, normalizedQuery, sectorFilter, sort],
  )
  const sectorRankings = useMemo(
    () => buildSectorRankings(sectors, minCorr, sign, normalizedQuery, sectorFilter, sort),
    [sectors, minCorr, sign, normalizedQuery, sectorFilter, sort],
  )

  const visibleCrossPairs = crossRanking.pairs
  const visibleSectorGroups = sectorRankings.filter(group => group.total > 0)
  const activeSector = visibleSectorGroups.find(group => group.sector.name === selectedSector) ?? visibleSectorGroups[0] ?? null
  const totalSectorPairs = sectorRankings.reduce((sum, group) => sum + group.total, 0)
  const empty = mode === 'cross' ? visibleCrossPairs.length === 0 : visibleSectorGroups.length === 0

  return (
    <div className="h-full min-h-0 px-2 py-5 sm:px-4 lg:px-6 flex flex-col gap-5">
      <header className="shrink-0 flex items-start justify-between gap-5 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] text-muted font-mono tracking-[0.12em] uppercase">Ranking</p>
          <h2 className="mt-1 text-[24px] font-semibold text-ink tracking-[-0.6px]">相関ランキング</h2>
          <p className="mt-1 text-[12px] text-muted">
            セクターをまたぐ関係と、セクター内の強い組み合わせを切り替えて確認できます。
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <SegmentedSwitch
              options={[
                { id: 'cross', label: 'セクター間' },
                { id: 'inside', label: 'セクター内' },
              ]}
              value={mode}
              onChange={setMode}
            />
            <SegmentedSwitch
              options={[
                { id: 'all', label: 'すべて' },
                { id: 'pos', label: '正相関' },
                { id: 'neg', label: '逆相関' },
              ]}
              value={sign}
              onChange={setSign}
            />
          </div>
        </div>
      </header>

      <div className="shrink-0 grid gap-2 md:grid-cols-[minmax(220px,1fr)_170px_170px]">
        <label className="h-10 rounded-full bg-paper border border-border px-4 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="銘柄名・コード・セクターで検索"
            className="min-w-0 flex-1 bg-transparent outline-none text-[13px] text-ink placeholder:text-muted"
          />
        </label>
        <select
          value={sectorFilter}
          onChange={event => {
            setSectorFilter(event.target.value)
            setSelectedSector(null)
          }}
          className="h-10 rounded-full bg-paper border border-border px-4 text-[13px] text-ink outline-none cursor-pointer"
        >
          <option value="all">全セクター</option>
          {sectors.map(sector => (
            <option key={sector.name} value={sector.name}>{sector.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={event => setSort(event.target.value as SortMode)}
          className="h-10 rounded-full bg-paper border border-border px-4 text-[13px] text-ink outline-none cursor-pointer"
        >
          <option value="strength">強さ順</option>
          <option value="highest">相関値 高い順</option>
          <option value="lowest">相関値 低い順</option>
          <option value="name">銘柄名順</option>
        </select>
      </div>

      <div className="grid gap-3 shrink-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Metric label="表示モード" value={mode === 'cross' ? 'セクター間' : 'セクター内'} />
        <Metric label="対象" value={signLabel(sign)} />
        <Metric label="並び順" value={sortLabel(sort)} />
        <Metric label="下限" value={minCorr.toFixed(2)} />
        <Metric label="候補ペア" value={mode === 'cross' ? crossRanking.total.toLocaleString('ja-JP') : totalSectorPairs.toLocaleString('ja-JP')} />
      </div>

      <div className="min-h-0 flex-1">
        {empty ? (
          <EmptyState />
        ) : mode === 'cross' ? (
          <CrossRankingTable
            pairs={visibleCrossPairs}
            total={crossRanking.total}
            onStockSelect={onStockSelect}
          />
        ) : (
          <SectorRankingPanel
            groups={visibleSectorGroups}
            active={activeSector}
            onSelectSector={setSelectedSector}
            onStockSelect={onStockSelect}
          />
        )}
      </div>
    </div>
  )
}

function SegmentedSwitch<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center bg-subtle rounded-full p-1 gap-1">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'h-8 px-4 rounded-full text-[12px] font-semibold transition-all cursor-pointer whitespace-nowrap',
            value === option.id
              ? 'bg-paper text-ink shadow-[0_1px_4px_rgba(0,0,0,0.12)]'
              : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-border pt-3">
      <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase">{label}</p>
      <p className="mt-1 text-[18px] text-ink font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-full min-h-[260px] flex items-center justify-center border-y border-border">
      <p className="text-[12px] text-muted font-mono">
        条件に一致するランキングがありません。相関係数の下限を下げてください。
      </p>
    </div>
  )
}

function CrossRankingTable({
  pairs,
  total,
  onStockSelect,
}: {
  pairs: CrossSectorPair[]
  total: number
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <section className="h-full min-h-0 flex flex-col rounded-[18px] border border-border bg-paper overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4 shrink-0">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">セクター間ランキング</h3>
          <p className="text-[11px] text-muted mt-0.5">
            別セクター同士の銘柄ペアを上位 {Math.min(MAX_CROSS_ROWS, total)} 件表示
          </p>
        </div>
        <span className="text-[11px] text-muted font-mono tabular-nums">{total} pairs</span>
      </div>

      <div className="hidden lg:grid grid-cols-[56px_220px_minmax(0,1fr)_160px_88px] gap-3 px-5 py-2.5 border-b border-border text-[10px] text-muted font-mono tracking-[0.08em] uppercase shrink-0">
        <span>Rank</span>
        <span>Sector</span>
        <span>Pair</span>
        <span>Strength</span>
        <span className="text-right">Corr</span>
      </div>

      <div className="min-h-0 overflow-auto divide-y divide-border">
        {pairs.map((pair, index) => (
          <CrossRow
            key={`${pair.sectorA.name}-${pair.stockA.code}-${pair.sectorB.name}-${pair.stockB.code}`}
            rank={index + 1}
            pair={pair}
            onStockSelect={onStockSelect}
          />
        ))}
      </div>
    </section>
  )
}

function CrossRow({
  rank,
  pair,
  onStockSelect,
}: {
  rank: number
  pair: CrossSectorPair
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_72px] lg:grid-cols-[56px_220px_minmax(0,1fr)_160px_88px] gap-3 items-center px-4 lg:px-5 py-3 hover:bg-subtle/70 transition-colors">
      <RankNumber rank={rank} />
      <SectorPairBadge sectorA={pair.sectorA} sectorB={pair.sectorB} />
      <StockPair stockA={pair.stockA} stockB={pair.stockB} onStockSelect={onStockSelect} />
      <StrengthBar corr={pair.corr} className="hidden lg:flex" />
      <CorrBadge corr={pair.corr} />
    </div>
  )
}

function SectorRankingPanel({
  groups,
  active,
  onSelectSector,
  onStockSelect,
}: {
  groups: SectorRanking[]
  active: SectorRanking | null
  onSelectSector: (sector: string) => void
  onStockSelect: (stock: StockInfo) => void
}) {
  if (!active) return <EmptyState />

  return (
    <section className="h-full min-h-0 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="min-h-0 rounded-[18px] border border-border bg-paper overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[14px] font-semibold text-ink">セクター選択</h3>
          <p className="text-[11px] text-muted mt-0.5">表示するセクターを切り替え</p>
        </div>
        <div className="max-h-[240px] lg:max-h-none lg:h-[calc(100%-65px)] overflow-auto">
          {groups.map(group => (
            <button
              key={group.sector.name}
              type="button"
              onClick={() => onSelectSector(group.sector.name)}
              className={cn(
                'w-full px-4 py-3 flex items-center gap-3 text-left border-b border-border last:border-b-0 cursor-pointer transition-colors',
                active.sector.name === group.sector.name ? 'bg-subtle text-ink' : 'text-muted hover:text-ink hover:bg-subtle/60',
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.sector.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold truncate">{group.sector.name}</span>
                <span className="block text-[10px] font-mono tabular-nums">{group.total} pairs</span>
              </span>
              <span className="text-[12px] font-mono tabular-nums" style={{ color: corrColor(group.pairs[0]?.corr ?? 0) }}>
                {group.pairs[0] ? corrLabel(group.pairs[0].corr) : '-'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 rounded-[18px] border border-border bg-paper overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: active.sector.color }} />
              <h3 className="text-[15px] font-semibold text-ink truncate">{active.sector.name}</h3>
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              セクター内の相関ペアを上位 {Math.min(MAX_SECTOR_ROWS, active.total)} 件表示
            </p>
          </div>
          <span className="text-[11px] text-muted font-mono tabular-nums shrink-0">{active.total} pairs</span>
        </div>

        <div className="hidden md:grid grid-cols-[56px_minmax(0,1fr)_150px_80px] gap-3 px-5 py-2.5 border-b border-border text-[10px] text-muted font-mono tracking-[0.08em] uppercase shrink-0">
          <span>Rank</span>
          <span>Pair</span>
          <span>Strength</span>
          <span className="text-right">Corr</span>
        </div>

        <div className="min-h-0 overflow-auto divide-y divide-border">
          {active.pairs.map((pair, index) => (
            <SectorRow
              key={`${pair.stockA.code}-${pair.stockB.code}`}
              rank={index + 1}
              pair={pair}
              onStockSelect={onStockSelect}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function SectorRow({
  rank,
  pair,
  onStockSelect,
}: {
  rank: number
  pair: Pair
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_72px] md:grid-cols-[56px_minmax(0,1fr)_150px_80px] gap-3 items-center px-4 md:px-5 py-3 hover:bg-subtle/70 transition-colors">
      <RankNumber rank={rank} />
      <StockPair stockA={pair.stockA} stockB={pair.stockB} onStockSelect={onStockSelect} />
      <StrengthBar corr={pair.corr} className="hidden md:flex" />
      <CorrBadge corr={pair.corr} />
    </div>
  )
}

function RankNumber({ rank }: { rank: number }) {
  const strong = rank <= 3
  return (
    <span
      className={cn(
        'text-right font-mono tabular-nums shrink-0',
        strong ? 'text-[15px] font-semibold text-ink' : 'text-[12px] text-muted',
      )}
    >
      {rank.toString().padStart(2, '0')}
    </span>
  )
}

function SectorPairBadge({ sectorA, sectorB }: { sectorA: SectorData; sectorB: SectorData }) {
  return (
    <div className="hidden lg:flex min-w-0 items-center gap-2">
      <SectorBadge sector={sectorA} />
      <span className="text-[11px] text-muted">×</span>
      <SectorBadge sector={sectorB} />
    </div>
  )
}

function SectorBadge({ sector }: { sector: SectorData }) {
  return (
    <span
      className="min-w-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-ink font-medium"
      style={{ backgroundColor: hexToRgba(sector.color, 0.13) }}
      title={sector.name}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
      <span className="truncate">{sector.name}</span>
    </span>
  )
}

function StockPair({
  stockA,
  stockB,
  onStockSelect,
}: {
  stockA: StockInfo
  stockB: StockInfo
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <div className="min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      <StockButton stock={stockA} align="right" onStockSelect={onStockSelect} />
      <span className="text-[11px] text-muted">×</span>
      <StockButton stock={stockB} align="left" onStockSelect={onStockSelect} />
    </div>
  )
}

function StockButton({
  stock,
  align,
  onStockSelect,
}: {
  stock: StockInfo
  align: 'left' | 'right'
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onStockSelect(stock)}
      className={cn(
        'min-w-0 cursor-pointer group',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      title={`${stock.name} (${stock.code})`}
    >
      <span className="block truncate text-[13px] font-semibold text-ink group-hover:text-muted">{stock.label}</span>
      <span className="block truncate text-[10px] text-muted font-mono tabular-nums">{stock.code}</span>
    </button>
  )
}

function StrengthBar({ corr, className }: { corr: number; className?: string }) {
  const color = corrColor(corr)
  return (
    <div className={cn('items-center gap-2', className)}>
      <span className="w-10 text-[10px] text-muted">{toneLabel(corr)}</span>
      <div className="h-[6px] flex-1 rounded-full bg-subtle overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(6, Math.abs(corr) * 100)}%`, backgroundColor: color, opacity: 0.8 }}
        />
      </div>
    </div>
  )
}

function CorrBadge({ corr }: { corr: number }) {
  return (
    <span
      className="justify-self-end h-8 min-w-[64px] px-2 rounded-full flex items-center justify-center text-[13px] font-semibold font-mono tabular-nums"
      style={{
        color: corrColor(corr),
        backgroundColor: hexToRgba(corr >= 0 ? '#16a34a' : '#dc2626', 0.1),
      }}
    >
      {corrLabel(corr)}
    </span>
  )
}
