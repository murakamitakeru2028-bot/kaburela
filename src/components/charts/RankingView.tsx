import { useMemo, useRef, useState } from 'react'
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

type Mode = 'all' | 'cross' | 'inside'
type Sign = 'all' | 'pos' | 'neg'
type SortMode = 'strength' | 'highest' | 'lowest' | 'name'

interface RankedPair {
  stockA: StockInfo
  stockB: StockInfo
  corr: number
  sectorA: SectorData
  sectorB: SectorData
}

interface PairRanking {
  pairs: RankedPair[]
  total: number
}

interface SectorRanking {
  sector: SectorData
  pairs: RankedPair[]
  total: number
}

const MAX_LIST_ROWS = 36
const MAX_SECTOR_ROWS = 20

function corrLabel(corr: number): string {
  return `${corr >= 0 ? '+' : ''}${corr.toFixed(2)}`
}

function corrColor(corr: number): string {
  return corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'
}

function modeLabel(mode: Mode): string {
  if (mode === 'all') return 'すべて'
  if (mode === 'cross') return 'セクター間'
  return 'セクター内'
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

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

function stockMatches(stock: StockInfo, query: string): boolean {
  if (!query) return true
  return [stock.code, stock.name, stock.label].some(value => value.toLowerCase().includes(query))
}

function pairMatchesQuery(pair: RankedPair, query: string): boolean {
  if (!query) return true
  return stockMatches(pair.stockA, query) ||
    stockMatches(pair.stockB, query) ||
    pair.sectorA.name.toLowerCase().includes(query) ||
    pair.sectorB.name.toLowerCase().includes(query)
}

function pairMatchesSign(corr: number, sign: Sign): boolean {
  if (sign === 'pos') return corr >= 0
  if (sign === 'neg') return corr < 0
  return true
}

function pairName(pair: RankedPair): string {
  return `${pair.stockA.label}${pair.stockB.label}${pair.stockA.code}${pair.stockB.code}`
}

function comparePairs(a: RankedPair, b: RankedPair, sort: SortMode): number {
  if (sort === 'highest') return b.corr - a.corr
  if (sort === 'lowest') return a.corr - b.corr
  if (sort === 'name') return pairName(a).localeCompare(pairName(b), 'ja')
  return Math.abs(b.corr) - Math.abs(a.corr)
}

function addTopPair(pairs: RankedPair[], pair: RankedPair, limit: number, sort: SortMode) {
  if (pairs.length >= limit && comparePairs(pair, pairs[pairs.length - 1], sort) >= 0) return
  const insertAt = pairs.findIndex(item => comparePairs(pair, item, sort) < 0)
  pairs.splice(insertAt === -1 ? pairs.length : insertAt, 0, pair)
  if (pairs.length > limit) pairs.pop()
}

function sectorByCode(sectors: SectorData[]): Map<string, SectorData> {
  const map = new Map<string, SectorData>()
  sectors.forEach(sector => {
    sector.stocks.forEach(stock => map.set(stock.code, sector))
  })
  return map
}

function buildListPairs(
  mode: Exclude<Mode, 'inside'>,
  sectors: SectorData[],
  correlation: CorrelationResponse | null,
  minCorr: number,
  sign: Sign,
  query: string,
  sectorFilter: string,
  sort: SortMode,
): PairRanking {
  if (!correlation) return { pairs: [], total: 0 }

  const sectorsByCode = sectorByCode(sectors)
  const pairs: RankedPair[] = []
  let total = 0

  for (let i = 0; i < correlation.stocks.length; i++) {
    const stockA = correlation.stocks[i]
    const sectorA = sectorsByCode.get(stockA.code)
    if (!sectorA) continue

    for (let j = i + 1; j < correlation.stocks.length; j++) {
      const stockB = correlation.stocks[j]
      const sectorB = sectorsByCode.get(stockB.code)
      if (!sectorB) continue
      if (mode === 'cross' && sectorA.name === sectorB.name) continue
      if (sectorFilter !== 'all' && sectorA.name !== sectorFilter && sectorB.name !== sectorFilter) continue

      const corr = correlation.matrix[i]?.[j]
      if (corr == null || Math.abs(corr) < minCorr || !pairMatchesSign(corr, sign)) continue
      const pair = { stockA, stockB, corr, sectorA, sectorB }
      if (!pairMatchesQuery(pair, query)) continue
      total++
      addTopPair(pairs, pair, MAX_LIST_ROWS, sort)
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

    const pairs: RankedPair[] = []
    let total = 0
    for (let i = 0; i < sector.stocks.length; i++) {
      for (let j = i + 1; j < sector.stocks.length; j++) {
        const corr = sector.matrix[i]?.[j]
        if (corr == null || Math.abs(corr) < minCorr || !pairMatchesSign(corr, sign)) continue
        const pair = {
          stockA: sector.stocks[i],
          stockB: sector.stocks[j],
          corr,
          sectorA: sector,
          sectorB: sector,
        }
        if (!pairMatchesQuery(pair, query)) continue
        total++
        addTopPair(pairs, pair, MAX_SECTOR_ROWS, sort)
      }
    }
    return { sector, pairs, total }
  })
}

export function RankingView({ sectors, correlation, minCorr, onStockSelect }: Props) {
  const [mode, setMode] = useState<Mode>('all')
  const [sign, setSign] = useState<Sign>('all')
  const [sort, setSort] = useState<SortMode>('strength')
  const [query, setQuery] = useState('')
  const [sectorFilter, setSectorFilter] = useState('all')
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = normalizeQuery(query)

  function openSearch() {
    setSearchOpen(true)
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
  }

  const listRanking = useMemo(
    () => buildListPairs(mode === 'cross' ? 'cross' : 'all', sectors, correlation, minCorr, sign, normalizedQuery, sectorFilter, sort),
    [mode, sectors, correlation, minCorr, sign, normalizedQuery, sectorFilter, sort],
  )
  const sectorRankings = useMemo(
    () => buildSectorRankings(sectors, minCorr, sign, normalizedQuery, sectorFilter, sort),
    [sectors, minCorr, sign, normalizedQuery, sectorFilter, sort],
  )

  const visibleSectorGroups = sectorRankings.filter(group => group.total > 0)
  const activeSector = visibleSectorGroups.find(group => group.sector.name === selectedSector) ?? visibleSectorGroups[0] ?? null
  const totalSectorPairs = sectorRankings.reduce((sum, group) => sum + group.total, 0)
  const empty = mode === 'inside' ? visibleSectorGroups.length === 0 : listRanking.pairs.length === 0

  return (
    <div className="h-full min-h-0 px-1.5 py-2 sm:px-4 sm:py-2 lg:px-6 flex flex-col gap-1.5">
      <header className="shrink-0 flex flex-col gap-1 border-b border-border/70 pb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="shrink-0 flex flex-col justify-center mr-1">
            <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase leading-none">Kaburela</p>
            <h2 className="text-[15px] font-semibold text-ink tracking-tight leading-tight">相関ランキング</h2>
          </div>
          <span className="w-px h-8 bg-border shrink-0" />
          <SegmentedSwitch
            options={[
              { id: 'all', label: 'すべて' },
              { id: 'cross', label: 'セクター間' },
              { id: 'inside', label: 'セクター内' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <span className="w-px h-4 bg-border shrink-0" />
          <SegmentedSwitch
            options={[
              { id: 'all', label: 'すべて' },
              { id: 'pos', label: '正相関' },
              { id: 'neg', label: '逆相関' },
            ]}
            value={sign}
            onChange={setSign}
          />
          <span className="w-px h-4 bg-border shrink-0" />
          <SelectButton
            value={sectorFilter}
            onChange={value => { setSectorFilter(value); setSelectedSector(null) }}
            options={[
              { value: 'all', label: '全セクター' },
              ...sectors.map(s => ({ value: s.name, label: s.name })),
            ]}
          />
          <SelectButton
            value={sort}
            onChange={value => setSort(value as SortMode)}
            options={[
              { value: 'strength', label: '強さ順' },
              { value: 'highest', label: '相関値 高い順' },
              { value: 'lowest', label: '相関値 低い順' },
              { value: 'name', label: '銘柄名順' },
            ]}
          />
          <div className="ml-auto">
            {searchOpen ? (
              <label className="h-8 rounded-full bg-paper border border-border px-3 flex items-center gap-1.5 w-[180px] sm:w-[220px]">
                <svg width="12" height="12" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="銘柄・コード・セクター"
                  className="min-w-0 flex-1 bg-transparent outline-none text-[12px] text-ink placeholder:text-muted"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  className="text-muted hover:text-ink cursor-pointer shrink-0 p-0.5"
                  aria-label="検索を閉じる"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </label>
            ) : (
              <button
                type="button"
                onClick={openSearch}
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center cursor-pointer transition-colors',
                  query ? 'bg-subtle text-ink' : 'text-muted hover:bg-subtle hover:text-ink',
                )}
                aria-label="検索"
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden>
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatLine label="モード" value={modeLabel(mode)} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="対象" value={signLabel(sign)} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="並び" value={sortLabel(sort)} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="下限" value={minCorr.toFixed(2)} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="候補" value={mode === 'inside' ? totalSectorPairs.toLocaleString('ja-JP') : listRanking.total.toLocaleString('ja-JP')} />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {empty ? (
          <EmptyState />
        ) : mode === 'inside' ? (
          <SectorRankingPanel
            groups={visibleSectorGroups}
            active={activeSector}
            onSelectSector={setSelectedSector}
            onStockSelect={onStockSelect}
          />
        ) : (
          <RankingList
            pairs={listRanking.pairs}
            total={listRanking.total}
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
    <div className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'h-7 px-2.5 text-[12px] font-medium transition-all cursor-pointer whitespace-nowrap border-b-2',
            value === option.id
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink/70',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function SelectButton({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const label = options.find(o => o.value === value)?.label ?? value
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={label}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="flex items-center gap-1 h-7 px-1.5 text-[12px] text-ink/70 hover:text-ink transition-colors cursor-pointer select-none">
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase">{label}</span>
      <span className="text-[12px] font-semibold font-mono tabular-nums text-ink">{value}</span>
    </span>
  )
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="h-8 px-3 rounded-full bg-subtle flex items-center gap-2">
      <span className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase">{label}</span>
      <span className="text-[12px] text-ink font-semibold font-mono tabular-nums">{value}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-full min-h-[260px] flex items-center justify-center border-y border-border/70">
      <p className="text-[12px] text-muted font-mono">
        条件に一致するランキングがありません。相関係数の下限やフィルターを調整してください。
      </p>
    </div>
  )
}

function RankingList({
  pairs,
  total,
  onStockSelect,
}: {
  pairs: RankedPair[]
  total: number
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <section className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-center px-1 py-1.5 border-y border-border/70 shrink-0">
        <div className="hidden lg:grid grid-cols-[56px_minmax(0,1fr)_220px_160px] flex-1 gap-3 text-[10px] text-muted font-mono tracking-[0.08em] uppercase">
          <span>Rank</span>
          <span>Pair</span>
          <span>Sector</span>
          <span>Strength</span>
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <StatLine label="表示" value={pairs.length.toLocaleString('ja-JP')} />
          <span className="text-muted/40 text-[10px] select-none">·</span>
          <StatLine label="候補" value={total.toLocaleString('ja-JP')} />
          <span className="hidden lg:inline w-[88px] text-right text-[10px] text-muted font-mono tracking-[0.08em] uppercase">Corr</span>
        </div>
      </div>

      <div className="min-h-0 overflow-auto">
        {pairs.map((pair, index) => (
          <RankingRow
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
    <section className="h-full min-h-0 grid gap-3 sm:gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="min-h-0 overflow-hidden">
        <div className="px-1 pb-2">
          <p className="text-[10px] text-muted font-mono tracking-[0.14em] uppercase">Sectors</p>
          <h3 className="text-[14px] font-semibold text-ink">セクター選択</h3>
        </div>
        <div className="max-h-[170px] sm:max-h-[240px] lg:max-h-none lg:h-full overflow-auto border-y border-border/70">
          {groups.map(group => (
            <button
              key={group.sector.name}
              type="button"
              onClick={() => onSelectSector(group.sector.name)}
              className={cn(
                'w-full px-1 py-3 flex items-center gap-3 text-left border-b border-border/60 last:border-b-0 cursor-pointer transition-colors',
                active.sector.name === group.sector.name ? 'text-ink bg-subtle/60' : 'text-muted hover:text-ink hover:bg-subtle/40',
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

      <section className="min-h-0 overflow-hidden flex flex-col">
        <div className="px-1 pb-2 flex flex-wrap items-end justify-between gap-3 sm:gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: active.sector.color }} />
              <h3 className="text-[15px] font-semibold text-ink truncate">{active.sector.name}</h3>
            </div>
            <p className="text-[11px] text-muted mt-0.5">セクター内の相関ペアを上位表示</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <StatusPill label="表示" value={active.pairs.length.toLocaleString('ja-JP')} />
            <StatusPill label="候補" value={active.total.toLocaleString('ja-JP')} />
          </div>
        </div>

        <div className="hidden md:grid grid-cols-[56px_minmax(0,1fr)_150px_80px] gap-3 px-1 py-2.5 border-y border-border/70 text-[10px] text-muted font-mono tracking-[0.08em] uppercase shrink-0">
          <span>Rank</span>
          <span>Pair</span>
          <span>Strength</span>
          <span className="text-right">Corr</span>
        </div>

        <div className="min-h-0 overflow-auto">
          {active.pairs.map((pair, index) => (
            <SectorRow
              key={`${pair.stockA.code}-${pair.stockB.code}`}
              rank={index + 1}
              pair={pair}
              onStockSelect={onStockSelect}
            />
          ))}
        </div>
      </section>
    </section>
  )
}

function RankingRow({
  rank,
  pair,
  onStockSelect,
}: {
  rank: number
  pair: RankedPair
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <div className="relative grid grid-cols-[34px_minmax(0,1fr)] min-[520px]:grid-cols-[40px_minmax(0,1fr)_72px] lg:grid-cols-[56px_minmax(0,1fr)_220px_160px_88px] gap-x-2 gap-y-1 sm:gap-x-3 items-center border-b border-border/60 px-1 py-3 sm:py-3.5 transition-colors hover:bg-subtle/55">
      <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full" style={{ backgroundColor: corrColor(pair.corr), opacity: rank <= 3 ? 0.95 : 0.5 }} />
      <RankNumber rank={rank} />
      <StockPair stockA={pair.stockA} stockB={pair.stockB} onStockSelect={onStockSelect} />
      <SectorPairBadge sectorA={pair.sectorA} sectorB={pair.sectorB} />
      <StrengthBar corr={pair.corr} className="hidden lg:flex" />
      <CorrBadge corr={pair.corr} />
    </div>
  )
}

function SectorRow({
  rank,
  pair,
  onStockSelect,
}: {
  rank: number
  pair: RankedPair
  onStockSelect: (stock: StockInfo) => void
}) {
  return (
    <div className="relative grid grid-cols-[34px_minmax(0,1fr)] min-[520px]:grid-cols-[40px_minmax(0,1fr)_72px] md:grid-cols-[56px_minmax(0,1fr)_150px_80px] gap-x-2 gap-y-1 sm:gap-x-3 items-center border-b border-border/60 px-1 py-3 sm:py-3.5 transition-colors hover:bg-subtle/55">
      <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full" style={{ backgroundColor: corrColor(pair.corr), opacity: rank <= 3 ? 0.95 : 0.5 }} />
      <RankNumber rank={rank} />
      <StockPair stockA={pair.stockA} stockB={pair.stockB} onStockSelect={onStockSelect} />
      <StrengthBar corr={pair.corr} className="hidden md:flex" />
      <CorrBadge corr={pair.corr} />
    </div>
  )
}

function RankNumber({ rank }: { rank: number }) {
  return (
    <span className={cn(
      'justify-self-end font-mono tabular-nums shrink-0',
      rank <= 3 ? 'text-[16px] font-semibold text-ink' : 'text-[12px] text-muted',
    )}>
      {rank.toString().padStart(2, '0')}
    </span>
  )
}

function SectorPairBadge({ sectorA, sectorB }: { sectorA: SectorData; sectorB: SectorData }) {
  return (
    <div className="hidden lg:flex min-w-0 items-center gap-2">
      <SectorBadge sector={sectorA} />
      <span className="h-px w-4 bg-border" />
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
    <div className="min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
      <StockButton stock={stockA} align="right" onStockSelect={onStockSelect} />
      <span className="h-px w-3 sm:w-5 bg-border" />
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
        'min-w-0 cursor-pointer rounded-lg px-1.5 sm:px-2 py-1 transition-colors hover:bg-subtle',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      title={`${stock.name} (${stock.code})`}
    >
      <span className="block truncate text-[12px] sm:text-[13px] font-semibold text-ink">{stock.label}</span>
      <span className="block truncate text-[10px] text-muted font-mono tabular-nums">{stock.code}</span>
    </button>
  )
}

function StrengthBar({ corr, className }: { corr: number; className?: string }) {
  const color = corrColor(corr)
  return (
    <div className={cn('items-center gap-2', className)}>
      <span className="w-10 text-[10px] text-muted">{toneLabel(corr)}</span>
      <div className="h-[3px] flex-1 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(6, Math.abs(corr) * 100)}%`, backgroundColor: color, opacity: 0.9 }}
        />
      </div>
    </div>
  )
}

function CorrBadge({ corr }: { corr: number }) {
  return (
    <span
      className="col-start-2 justify-self-start min-[520px]:col-auto min-[520px]:justify-self-end h-8 min-w-[64px] px-2 rounded-full flex items-center justify-center text-[13px] font-semibold font-mono tabular-nums"
      style={{
        color: corrColor(corr),
        backgroundColor: hexToRgba(corr >= 0 ? '#16a34a' : '#dc2626', 0.1),
      }}
    >
      {corrLabel(corr)}
    </span>
  )
}
