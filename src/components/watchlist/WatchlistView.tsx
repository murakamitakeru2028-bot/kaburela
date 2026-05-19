import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { searchStocksApi } from '../../lib/api'
import { MiniHeatmap } from '../charts/MiniHeatmap'
import type { SectorData, CorrelationResponse } from '../../lib/api'
import type { View } from '../layout/tabConfig'
import type { StockInfo } from '../../types/stock'

interface WatchlistViewProps {
  sectors: SectorData[]
  correlation: CorrelationResponse | null
  onStockSelect: (stock: StockInfo) => void
  onNavigate: (view: View) => void
  onLogin: () => void
}

const NAV_ITEMS: { view: View; label: string; color: string }[] = [
  { view: 'trend',    label: 'トレンド',       color: '#ff6b6b' },
  { view: 'heatmap',  label: 'ヒートマップ',   color: '#ff34ff' },
  { view: 'network',  label: 'ネットワーク',   color: '#16a3ff' },
  { view: 'macro',    label: 'マクロ',          color: '#ffb000' },
  { view: 'ranking',  label: 'ランキング',      color: '#00c878' },
]

interface WatchlistItem {
  code: string
  added_at: string
}

function buildStockMap(sectors: SectorData[]): Map<string, StockInfo & { sector: string; color: string }> {
  const map = new Map<string, StockInfo & { sector: string; color: string }>()
  for (const s of sectors) {
    for (const stock of s.stocks) {
      map.set(stock.code, { ...stock, sector: s.name, color: s.color })
    }
  }
  return map
}

function buildWatchlistMatrix(items: WatchlistItem[], correlation: CorrelationResponse | null) {
  if (!correlation || items.length < 2) return null
  const codeToIdx = new Map(correlation.stocks.map((s, i) => [s.code, i]))
  const matched = items
    .map(item => ({ stock: correlation.stocks[codeToIdx.get(item.code)!], idx: codeToIdx.get(item.code) }))
    .filter(w => w.idx !== undefined) as { stock: StockInfo; idx: number }[]
  if (matched.length < 2) return null
  const stocks = matched.map(w => w.stock)
  const matrix = matched.map(a => matched.map(b => a.idx === b.idx ? 1.0 : (correlation.matrix[a.idx][b.idx] ?? 0)))
  return { stocks, matrix }
}

function watchlistKey(userId: string) { return `kaburela_watchlist_${userId}` }
function loadFromStorage(userId: string): WatchlistItem[] {
  try {
    const s = localStorage.getItem(watchlistKey(userId))
    return s ? (JSON.parse(s) as WatchlistItem[]) : []
  } catch { return [] }
}
function saveToStorage(userId: string, items: WatchlistItem[]) {
  localStorage.setItem(watchlistKey(userId), JSON.stringify(items))
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M7.5 1L9.18 5.27L13.5 5.64L10.5 8.27L11.68 12.5L7.5 10.1L3.32 12.5L4.5 8.27L1.5 5.64L5.82 5.27L7.5 1Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ──────── 検索パネル ────────
function SearchPanel({
  watchedCodes,
  onAdd,
}: {
  watchedCodes: Set<string>
  onAdd: (code: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const r = await searchStocksApi(q)
        if (!cancelled) setResults(r.slice(0, 6))
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 h-9 rounded-[10px] bg-subtle border border-border">
        {isSearching ? (
          <div className="w-3 h-3 border border-border border-t-muted rounded-full animate-spin shrink-0" />
        ) : (
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="銘柄コード・名前で検索..."
          className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted outline-none"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(''); setResults([]) }} className="text-muted hover:text-ink cursor-pointer shrink-0" aria-label="クリア">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-paper rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.06)] z-20 overflow-hidden">
          {results.map(stock => (
            <div key={stock.code} className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle transition-colors">
              <span className="text-[11px] font-mono text-muted w-10 shrink-0">{stock.code}</span>
              <span className="text-[13px] text-ink flex-1 truncate">{stock.name}</span>
              <button
                type="button"
                onClick={() => { onAdd(stock.code); setQuery(''); setResults([]) }}
                disabled={watchedCodes.has(stock.code)}
                className="text-[11px] px-2 py-1 rounded-lg bg-ink text-paper disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80 transition-opacity cursor-pointer shrink-0"
              >
                {watchedCodes.has(stock.code) ? '追加済' : '追加'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────── セクターブラウザ ────────
function SectorBrowser({
  sectors,
  watchedCodes,
  onAdd,
}: {
  sectors: SectorData[]
  watchedCodes: Set<string>
  onAdd: (code: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="rounded-[10px] border border-border overflow-hidden">
      {sectors.map((sector, i) => (
        <div key={sector.name} className={i > 0 ? 'border-t border-border' : ''}>
          <button
            type="button"
            onClick={() => setExpanded(prev => prev === sector.name ? null : sector.name)}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-subtle transition-colors cursor-pointer text-left"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
            <span className="text-[13px] font-medium text-ink flex-1">{sector.name}</span>
            <span className="text-[11px] text-muted mr-1">{sector.stocks.length}銘柄</span>
            <ChevronIcon open={expanded === sector.name} />
          </button>

          {expanded === sector.name && (
            <div className="border-t border-border bg-subtle/50 max-h-48 overflow-y-auto">
              {sector.stocks.map(stock => (
                <div key={stock.code} className="flex items-center gap-3 px-4 py-2 hover:bg-subtle transition-colors">
                  <span className="text-[11px] font-mono text-muted w-10 shrink-0">{stock.code}</span>
                  <span className="text-[13px] text-ink flex-1 truncate">{stock.name}</span>
                  <button
                    type="button"
                    onClick={() => onAdd(stock.code)}
                    disabled={watchedCodes.has(stock.code)}
                    className="text-[11px] px-2 py-1 rounded-lg bg-ink text-paper disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                  >
                    {watchedCodes.has(stock.code) ? '追加済' : '追加'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ──────── メインビュー ────────
export function WatchlistView({ sectors, correlation, onStockSelect, onNavigate, onLogin }: WatchlistViewProps) {
  const { user, userId } = useAuth()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [addMode, setAddMode] = useState<'search' | 'sector'>('search')
  const stockMap = buildStockMap(sectors)
  const watchlistMatrix = buildWatchlistMatrix(items, correlation)

  useEffect(() => {
    if (!userId) { setItems([]); return }
    setItems(loadFromStorage(userId))
  }, [userId])

  const handleAdd = useCallback((code: string) => {
    if (!userId) return
    setItems(prev => {
      if (prev.some(i => i.code === code)) return prev
      const next = [{ code, added_at: new Date().toISOString() }, ...prev]
      saveToStorage(userId, next)
      return next
    })
  }, [userId])

  const handleRemove = useCallback((code: string) => {
    if (!userId) return
    setItems(prev => {
      const next = prev.filter(i => i.code !== code)
      saveToStorage(userId, next)
      return next
    })
  }, [userId])

  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-12 h-12 rounded-2xl bg-subtle flex items-center justify-center text-muted">
          <StarIcon />
        </div>
        <div>
          <p className="text-[14px] font-medium text-ink mb-1">マイリスト</p>
          <p className="text-[13px] text-muted">気になる銘柄を保存できます</p>
        </div>
        <button
          type="button"
          onClick={onLogin}
          className="h-9 px-5 rounded-[10px] text-[13px] font-medium bg-ink text-paper hover:opacity-80 transition-opacity cursor-pointer"
        >
          Googleでログイン
        </button>
      </div>
    )
  }

  const watchedCodes = new Set(items.map(i => i.code))

  return (
    <div className="flex flex-col gap-5 pb-8 pt-1">

      {/* 銘柄追加エリア */}
      <div className="flex flex-col gap-2">
        {/* 検索 / セクタータブ */}
        <div className="flex gap-1 p-0.5 rounded-[10px] bg-subtle w-fit">
          {(['search', 'sector'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setAddMode(mode)}
              className={`px-3 h-7 rounded-[8px] text-[12px] font-medium transition-colors cursor-pointer ${
                addMode === mode
                  ? 'bg-paper text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {mode === 'search' ? '検索' : 'セクターから探す'}
            </button>
          ))}
        </div>

        {addMode === 'search' ? (
          <SearchPanel watchedCodes={watchedCodes} onAdd={handleAdd} />
        ) : (
          <SectorBrowser sectors={sectors} watchedCodes={watchedCodes} onAdd={handleAdd} />
        )}
      </div>

      {/* 相関マトリクス（2銘柄以上のとき表示） */}
      {watchlistMatrix && (
        <div>
          <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-2">
            相関マトリクス
          </p>
          <div className="max-w-xs">
            <MiniHeatmap
              stocks={watchlistMatrix.stocks}
              matrix={watchlistMatrix.matrix}
              minCorr={0}
            />
          </div>
        </div>
      )}

      {/* 他のビューへのナビゲーション */}
      <div>
        <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-2">分析ツール</p>
        <div className="flex flex-wrap gap-2">
          {NAV_ITEMS.map(({ view, label, color }) => (
            <button
              key={view}
              type="button"
              onClick={() => onNavigate(view)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] border border-border bg-paper text-[12px] font-medium text-ink hover:border-muted hover:shadow-sm transition-all cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {label}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="text-muted">
                <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* 銘柄リスト */}
      {items.length === 0 ? (
        <p className="text-[13px] text-muted text-center py-8">
          まだ銘柄がありません。上から追加してください。
        </p>
      ) : (
        <div>
          <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-2">
            保存中 {items.length}銘柄
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {items.map(item => {
              const stock = stockMap.get(item.code)
              return (
                <div
                  key={item.code}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-paper border border-border hover:border-ink/20 transition-colors group"
                >
                  <button
                    type="button"
                    onClick={() => onStockSelect(stock ?? { code: item.code, name: item.code, label: '' })}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {stock?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stock.color }} />}
                      <span className="text-[11px] font-mono text-muted">{item.code}</span>
                    </div>
                    <p className="text-[13px] font-medium text-ink truncate mt-0.5">{stock?.name ?? item.code}</p>
                    {stock?.sector && <p className="text-[11px] text-muted truncate">{stock.sector}</p>}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.code)}
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 hover:text-ink hover:bg-subtle transition-all cursor-pointer"
                    aria-label={`${item.code}をマイリストから削除`}
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
