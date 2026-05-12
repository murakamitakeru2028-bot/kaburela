import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { hexToRgba } from '../../lib/colorUtils'
import {
  fetchStockCorrelations,
  searchStocksApi,
  type SectorData,
  type StockCorrelationPeer,
} from '../../lib/api'
import type { StockInfo } from '../../types/stock'
import { PERIODS, type Period } from '../../types/filter'

interface Props {
  period: Period
  onPeriodChange: (period: Period) => void
  sectors: SectorData[]
  onStockSelect: (stock: StockInfo) => void
  initialStock?: StockInfo | null
}

// 検索前に提示する候補（マスター取得前でも何か選べるように）。
const SUGGESTIONS: StockInfo[] = [
  { code: '7203', name: 'トヨタ自動車', label: 'トヨタ' },
  { code: '6758', name: 'ソニーグループ', label: 'ソニーG' },
  { code: '8306', name: '三菱UFJフィナンシャル・グループ', label: '三菱UFJ' },
  { code: '9432', name: '日本電信電話', label: 'NTT' },
  { code: '9983', name: 'ファーストリテイリング', label: 'ユニクロ' },
  { code: '6861', name: 'キーエンス', label: 'キーエンス' },
  { code: '8035', name: '東京エレクトロン', label: '東エレク' },
  { code: '9984', name: 'ソフトバンクグループ', label: 'SBG' },
]

// 正相関・逆相関それぞれ表示する件数。
const TOP_N = 18

function corrLabel(corr: number): string {
  return `${corr >= 0 ? '+' : ''}${corr.toFixed(2)}`
}

function corrColor(corr: number): string {
  return corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'
}

function sectorByCode(sectors: SectorData[]): Map<string, SectorData> {
  const map = new Map<string, SectorData>()
  sectors.forEach(sector => sector.stocks.forEach(stock => map.set(stock.code, sector)))
  return map
}

export function StockCorrelationView({ period, onPeriodChange, sectors, onStockSelect, initialStock }: Props) {
  const [selected, setSelected] = useState<StockInfo | null>(initialStock ?? null)
  // 取得済みデータは「どの銘柄・期間のものか」を一緒に持つ。現在の選択と一致すれば表示、
  // 一致しなければ（＝まだ取得中）ローディング、という形で派生させる（effect内の同期setStateを避ける）。
  const [loaded, setLoaded] = useState<{ code: string; period: string; peers: StockCorrelationPeer[] } | null>(null)
  const [failed, setFailed] = useState<{ code: string; period: string; message: string } | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockInfo[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const sectorMap = useMemo(() => sectorByCode(sectors), [sectors])

  // 銘柄・期間が決まったらランキングを取得する。
  useEffect(() => {
    if (!selected) return
    const code = selected.code
    let cancelled = false
    fetchStockCorrelations(code, period)
      .then(data => { if (!cancelled) setLoaded({ code, period, peers: data.peers }) })
      .catch((err: Error) => {
        if (!cancelled) setFailed({ code, period, message: err.message || '相関ランキングを取得できませんでした' })
      })
    return () => { cancelled = true }
  }, [selected, period])

  // 検索（200ms デバウンス）。
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const found = await searchStocksApi(q)
        if (!cancelled) setResults(found.slice(0, 8))
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  function changeQuery(value: string) {
    setQuery(value)
    if (!value.trim()) {
      setResults([])
      setSearching(false)
    }
  }

  function pickStock(stock: StockInfo) {
    setSelected(stock)
    setQuery('')
    setResults([])
    setSearching(false)
  }

  function isCurrent(entry: { code: string; period: string } | null): boolean {
    return !!entry && !!selected && entry.code === selected.code && entry.period === period
  }
  const peers = isCurrent(loaded) ? loaded!.peers : null
  const error = isCurrent(failed) ? failed!.message : null
  const loading = !!selected && peers === null && error === null

  const positives = useMemo(
    () => (peers ?? []).filter(p => p.corr > 0).slice(0, TOP_N),
    [peers],
  )
  const negatives = useMemo(
    () => (peers ?? []).filter(p => p.corr < 0).sort((a, b) => a.corr - b.corr).slice(0, TOP_N),
    [peers],
  )

  return (
    <div className="h-full min-h-0 px-1.5 py-2 sm:px-4 sm:py-2 lg:px-6 flex flex-col gap-2">
      <header className="shrink-0 flex flex-col gap-2 border-b border-border/70 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="h-8 rounded-full bg-paper border border-border px-3 flex items-center gap-1.5 w-[200px] sm:w-[260px]">
            <svg width="12" height="12" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={e => changeQuery(e.target.value)}
              placeholder="銘柄コード・名前で検索..."
              className="min-w-0 flex-1 bg-transparent outline-none text-[12px] text-ink placeholder:text-muted"
            />
            {searching && <div className="w-3 h-3 border border-border border-t-muted rounded-full animate-spin shrink-0" />}
            {query && !searching && (
              <button type="button" onClick={() => changeQuery('')} className="text-muted hover:text-ink cursor-pointer shrink-0 p-0.5" aria-label="検索語をクリア">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </label>

          <span className="w-px h-4 bg-border shrink-0" />

          <div className="flex items-center gap-1">
            {PERIODS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => onPeriodChange(p)}
                className={cn(
                  'h-[30px] px-2 text-[12px] font-semibold transition-colors cursor-pointer tabular-nums',
                  period === p ? 'text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {selected && (
            <button
              type="button"
              onClick={() => onStockSelect(selected)}
              className="ml-auto h-8 px-3 rounded-full bg-subtle text-ink text-[12px] font-medium hover:bg-border/60 transition-colors cursor-pointer flex items-center gap-1.5"
              title="チャートビューで開く"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M1 9L4 5L7 7.5L11 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              チャートで開く
            </button>
          )}
        </div>

        {results.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {results.map(stock => (
              <button
                key={stock.code}
                type="button"
                onClick={() => pickStock(stock)}
                className="h-7 px-2.5 rounded-full bg-paper border border-border text-[12px] text-ink hover:bg-subtle transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="font-mono text-[10px] text-muted tabular-nums">{stock.code}</span>
                <span className="truncate max-w-[160px]">{stock.name}</span>
              </button>
            ))}
          </div>
        )}

        {selected ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sectorMap.get(selected.code)?.color ?? 'var(--color-muted)' }} />
            <h2 className="text-[15px] font-semibold text-ink truncate">{selected.name}</h2>
            <span className="text-[11px] font-mono text-muted tabular-nums shrink-0">{selected.code}</span>
            {sectorMap.get(selected.code) && (
              <span className="text-[11px] text-muted truncate">· {sectorMap.get(selected.code)!.name}</span>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-muted">銘柄を選ぶと、相関の強い銘柄・逆相関の銘柄を表示します（プライム全銘柄が対象）。</p>
        )}
      </header>

      <div className="min-h-0 flex-1">
        {!selected ? (
          <EmptySuggestions onPick={pickStock} />
        ) : loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-border border-t-ink rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[12px] text-muted text-center max-w-sm">{error}</p>
          </div>
        ) : positives.length === 0 && negatives.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[12px] text-muted text-center">この銘柄の相関ランキングデータがありません。</p>
          </div>
        ) : (
          <div className="h-full min-h-0 grid gap-3 sm:gap-5 lg:grid-cols-2">
            <PeerPanel title="相関が強い銘柄" subtitle="同じ方向に動きやすい" peers={positives} sectorMap={sectorMap} onPick={pickStock} />
            <PeerPanel title="逆相関の銘柄" subtitle="反対方向に動きやすい" peers={negatives} sectorMap={sectorMap} onPick={pickStock} />
          </div>
        )}
      </div>
    </div>
  )
}

function EmptySuggestions({ onPick }: { onPick: (stock: StockInfo) => void }) {
  return (
    <div className="h-full min-h-[260px] flex flex-col items-center justify-center gap-4 border-y border-border/70">
      <p className="text-[12px] text-muted font-mono">銘柄を検索、または下から選んでください</p>
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {SUGGESTIONS.map(stock => (
          <button
            key={stock.code}
            type="button"
            onClick={() => onPick(stock)}
            className="h-8 px-3 rounded-full bg-paper border border-border text-[12px] text-ink hover:bg-subtle transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span className="font-mono text-[10px] text-muted tabular-nums">{stock.code}</span>
            {stock.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PeerPanel({
  title,
  subtitle,
  peers,
  sectorMap,
  onPick,
}: {
  title: string
  subtitle: string
  peers: StockCorrelationPeer[]
  sectorMap: Map<string, SectorData>
  onPick: (stock: StockInfo) => void
}) {
  return (
    <section className="min-h-0 flex flex-col overflow-hidden">
      <div className="px-1 pb-2 shrink-0">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        <p className="text-[11px] text-muted mt-0.5">{subtitle} · 上位 {peers.length} 件</p>
      </div>
      <div className="min-h-0 overflow-auto border-t border-border/70">
        {peers.length === 0 ? (
          <p className="px-2 py-6 text-[12px] text-muted text-center">該当する銘柄がありません</p>
        ) : (
          peers.map((peer, index) => (
            <PeerRow key={peer.stock.code} rank={index + 1} peer={peer} sector={sectorMap.get(peer.stock.code) ?? null} onPick={onPick} />
          ))
        )}
      </div>
    </section>
  )
}

function PeerRow({
  rank,
  peer,
  sector,
  onPick,
}: {
  rank: number
  peer: StockCorrelationPeer
  sector: SectorData | null
  onPick: (stock: StockInfo) => void
}) {
  const color = corrColor(peer.corr)
  return (
    <button
      type="button"
      onClick={() => onPick(peer.stock)}
      className="relative w-full grid grid-cols-[28px_minmax(0,1fr)_64px] sm:grid-cols-[32px_minmax(0,1fr)_88px_64px] items-center gap-x-2 sm:gap-x-3 px-1 py-2.5 text-left border-b border-border/60 last:border-b-0 transition-colors hover:bg-subtle/60 cursor-pointer"
      title={`${peer.stock.name} (${peer.stock.code})`}
    >
      <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full" style={{ backgroundColor: color, opacity: rank <= 3 ? 0.9 : 0.4 }} />
      <span className={cn('justify-self-end font-mono tabular-nums', rank <= 3 ? 'text-[14px] font-semibold text-ink' : 'text-[11px] text-muted')}>
        {rank.toString().padStart(2, '0')}
      </span>
      <span className="min-w-0 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sector?.color ?? 'var(--color-muted)' }} title={sector?.name} />
        <span className="min-w-0">
          <span className="block truncate text-[12px] sm:text-[13px] font-semibold text-ink">{peer.stock.name}</span>
          <span className="block truncate text-[10px] text-muted font-mono tabular-nums">{peer.stock.code}{sector ? ` · ${sector.name}` : ''}</span>
        </span>
      </span>
      <div className="hidden sm:flex items-center gap-2">
        <div className="h-[3px] flex-1 rounded-full bg-border overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.max(6, Math.abs(peer.corr) * 100)}%`, backgroundColor: color, opacity: 0.9 }} />
        </div>
      </div>
      <span
        className="justify-self-end h-7 min-w-[58px] px-2 rounded-full flex items-center justify-center text-[12px] font-semibold font-mono tabular-nums"
        style={{ color, backgroundColor: hexToRgba(peer.corr >= 0 ? '#16a34a' : '#dc2626', 0.1) }}
      >
        {corrLabel(peer.corr)}
      </span>
    </button>
  )
}
