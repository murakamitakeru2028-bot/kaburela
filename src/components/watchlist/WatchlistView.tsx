import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
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
  onNavigate: (view: View, filterCodes: string[]) => void
  onLogin: () => void
}

interface WatchlistItem {
  code: string
  added_at: string
}

const NAV_ITEMS: { view: View; label: string; color: string }[] = [
  { view: 'trend',   label: 'トレンド',     color: '#ff6b6b' },
  { view: 'heatmap', label: 'ヒートマップ', color: '#ff34ff' },
  { view: 'network', label: 'ネットワーク', color: '#16a3ff' },
  { view: 'macro',   label: 'マクロ',       color: '#ffb000' },
  { view: 'ranking', label: 'ランキング',   color: '#00c878' },
]

function buildStockMap(sectors: SectorData[]): Map<string, StockInfo & { sector: string; color: string }> {
  const map = new Map<string, StockInfo & { sector: string; color: string }>()
  for (const s of sectors) {
    for (const stock of s.stocks) map.set(stock.code, { ...stock, sector: s.name, color: s.color })
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

// ──────── 共通コンポーネント（他ビューと同じスタイル） ────────

function SegmentedSwitch<T extends string>({
  options, value, onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'h-7 px-2.5 text-[12px] font-medium transition-all cursor-pointer whitespace-nowrap border-b-2',
            value === o.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink/70',
          )}
        >
          {o.label}
        </button>
      ))}
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
    <div className="min-h-0 overflow-auto border-b border-border/70">
      {sectors.map(sector => (
        <div key={sector.name}>
          <button
            type="button"
            onClick={() => setExpanded(prev => prev === sector.name ? null : sector.name)}
            className="w-full flex items-center gap-2 px-1 py-2.5 hover:bg-subtle/55 transition-colors cursor-pointer text-left border-b border-border/60"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
            <span className="text-[13px] font-medium text-ink flex-1">{sector.name}</span>
            <span className="text-[10px] font-mono text-muted mr-1">{sector.stocks.length}銘柄</span>
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none"
              className={cn('text-muted transition-transform shrink-0', expanded === sector.name ? 'rotate-180' : '')}
              aria-hidden
            >
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {expanded === sector.name && (
            <div className="bg-subtle/30">
              {sector.stocks.map(stock => (
                <div key={stock.code} className="flex items-center gap-2 px-3 py-2 border-b border-border/40 hover:bg-subtle/55 transition-colors">
                  <span className="text-[11px] font-mono text-muted w-9 shrink-0">{stock.code}</span>
                  <span className="text-[12px] text-ink flex-1 truncate">{stock.name}</span>
                  <button
                    type="button"
                    onClick={() => onAdd(stock.code)}
                    disabled={watchedCodes.has(stock.code)}
                    className="text-[11px] h-6 px-2.5 rounded-full border border-border bg-paper text-muted disabled:opacity-40 disabled:cursor-not-allowed hover:border-ink hover:text-ink transition-colors cursor-pointer shrink-0"
                  >
                    {watchedCodes.has(stock.code) ? '追加済' : '+ 追加'}
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StockInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const stockMap = buildStockMap(sectors)
  const watchlistMatrix = buildWatchlistMatrix(items, correlation)

  useEffect(() => {
    if (!userId) { setItems([]); return }
    setItems(loadFromStorage(userId))
  }, [userId])

  useEffect(() => {
    if (addMode !== 'search') { setSearchResults([]); return }
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const r = await searchStocksApi(q)
        if (!cancelled) setSearchResults(r.slice(0, 8))
      } catch {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [searchQuery, addMode])

  const handleAdd = useCallback((code: string) => {
    if (!userId) return
    setItems(prev => {
      if (prev.some(i => i.code === code)) return prev
      const next = [{ code, added_at: new Date().toISOString() }, ...prev]
      saveToStorage(userId, next)
      return next
    })
    setSearchQuery('')
    setSearchResults([])
  }, [userId])

  const handleRemove = useCallback((code: string) => {
    if (!userId) return
    setItems(prev => {
      const next = prev.filter(i => i.code !== code)
      saveToStorage(userId, next)
      return next
    })
  }, [userId])

  const watchedCodes = new Set(items.map(i => i.code))

  // ──────── 未ログイン ────────
  if (!user) {
    return (
      <div className="h-full min-h-0 px-1.5 py-2 sm:px-4 sm:py-2 lg:px-6 flex flex-col gap-1.5">
        <header className="shrink-0 flex flex-col gap-1 border-b border-border/70 pb-1.5">
          <div className="flex items-center gap-2">
            <div className="shrink-0 flex flex-col justify-center mr-1">
              <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase leading-none">Kaburela</p>
              <h2 className="text-[15px] font-semibold text-ink tracking-tight leading-tight">マイリスト</h2>
            </div>
          </div>
        </header>
        <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center gap-4 border-y border-border/70">
          <p className="text-[12px] text-muted font-mono">気になる銘柄を保存してすぐ確認できます。</p>
          <button
            type="button"
            onClick={onLogin}
            className="h-9 px-5 rounded-full border border-border bg-paper text-[12px] font-medium text-ink hover:border-ink transition-colors cursor-pointer"
          >
            Googleでログイン
          </button>
        </div>
      </div>
    )
  }

  // ──────── ログイン済み ────────
  return (
    <div className="h-full min-h-0 px-1.5 py-2 sm:px-4 sm:py-2 lg:px-6 flex flex-col gap-1.5">

      {/* ヘッダー */}
      <header className="shrink-0 flex flex-col gap-1 border-b border-border/70 pb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="shrink-0 flex flex-col justify-center mr-1">
            <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase leading-none">Kaburela</p>
            <h2 className="text-[15px] font-semibold text-ink tracking-tight leading-tight">マイリスト</h2>
          </div>
          <span className="w-px h-8 bg-border shrink-0" />
          <SegmentedSwitch
            options={[
              { id: 'search', label: '検索で追加' },
              { id: 'sector', label: 'セクターから追加' },
            ]}
            value={addMode}
            onChange={v => { setAddMode(v); setSearchQuery(''); setSearchResults([]) }}
          />

          {/* 検索入力（検索モード時） */}
          {addMode === 'search' && (
            <div className="ml-auto shrink-0">
              <label className="h-8 rounded-full bg-paper border border-border px-3 flex items-center gap-1.5 w-[180px] sm:w-[220px]">
                {isSearching ? (
                  <div className="w-3 h-3 border border-border border-t-muted rounded-full animate-spin shrink-0" />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 15 15" fill="none" className="text-muted shrink-0" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="銘柄コード・名前で検索"
                  className="min-w-0 flex-1 bg-transparent outline-none text-[12px] text-ink placeholder:text-muted"
                />
                {searchQuery && (
                  <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]) }} className="text-muted hover:text-ink cursor-pointer shrink-0 p-0.5" aria-label="クリア">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </label>
            </div>
          )}
        </div>
      </header>

      {/* コンテンツ */}
      <div className="flex-1 min-h-0 overflow-auto flex flex-col">

        {/* 検索結果 */}
        {addMode === 'search' && searchResults.length > 0 && (
          <div className="shrink-0 border-b border-border/70 mb-1">
            {searchResults.map(stock => (
              <div key={stock.code} className="flex items-center gap-3 px-1 py-2.5 border-b border-border/40 last:border-0 hover:bg-subtle/55 transition-colors">
                <span className="text-[11px] font-mono text-muted w-9 shrink-0">{stock.code}</span>
                <span className="text-[13px] text-ink flex-1 truncate">{stock.name}</span>
                <span className="text-[10px] font-mono text-muted mr-2 hidden sm:block">{stock.label}</span>
                <button
                  type="button"
                  onClick={() => handleAdd(stock.code)}
                  disabled={watchedCodes.has(stock.code)}
                  className="text-[11px] h-6 px-2.5 rounded-full border border-border bg-paper text-muted disabled:opacity-40 disabled:cursor-not-allowed hover:border-ink hover:text-ink transition-colors cursor-pointer shrink-0"
                >
                  {watchedCodes.has(stock.code) ? '追加済' : '+ 追加'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* セクターブラウザ */}
        {addMode === 'sector' && (
          <SectorBrowser sectors={sectors} watchedCodes={watchedCodes} onAdd={handleAdd} />
        )}

        {/* マイリスト */}
        {items.length === 0 ? (
          <div className="flex-1 min-h-[200px] flex items-center justify-center border-y border-border/70">
            <p className="text-[12px] text-muted font-mono">まだ銘柄がありません。上から追加してください。</p>
          </div>
        ) : (
          <>
            {/* テーブルヘッダー */}
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_160px_40px] gap-3 px-1 py-1.5 border-b border-border/70 text-[10px] text-muted font-mono tracking-[0.08em] uppercase shrink-0">
              <span>銘柄</span>
              <span>セクター</span>
              <span />
            </div>

            {/* 銘柄行 */}
            {items.map(item => {
              const stock = stockMap.get(item.code)
              return (
                <div
                  key={item.code}
                  className="grid grid-cols-[minmax(0,1fr)_40px] sm:grid-cols-[minmax(0,1fr)_160px_40px] gap-x-3 items-center border-b border-border/60 px-1 py-3 sm:py-3 hover:bg-subtle/55 transition-colors group"
                >
                  <button
                    type="button"
                    onClick={() => onStockSelect(stock ?? { code: item.code, name: item.code, label: '' })}
                    className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
                  >
                    {stock?.color && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stock.color }} />
                    )}
                    <span className="text-[11px] font-mono text-muted w-9 shrink-0">{item.code}</span>
                    <span className="text-[13px] font-medium text-ink truncate">{stock?.name ?? item.code}</span>
                  </button>
                  <span className="hidden sm:block text-[11px] text-muted truncate">{stock?.sector ?? ''}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.code)}
                    className="w-8 h-8 flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 hover:text-ink transition-all cursor-pointer rounded-full hover:bg-subtle"
                    aria-label={`${item.code}を削除`}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </>
        )}

        {/* 相関マトリクス */}
        {watchlistMatrix && (
          <div className="shrink-0 pt-4 pb-2">
            <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase mb-2 px-1">相関マトリクス</p>
            <div className="max-w-xs px-1">
              <MiniHeatmap stocks={watchlistMatrix.stocks} matrix={watchlistMatrix.matrix} minCorr={0} />
            </div>
          </div>
        )}

        {/* 分析ツールへのナビゲーション */}
        <div className="shrink-0 pt-3 pb-2 border-t border-border/70 mt-2">
          <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase mb-2 px-1">分析ツール</p>
          <div className="flex flex-wrap gap-1.5 px-1">
            {NAV_ITEMS.map(({ view, label, color }) => (
              <button
                key={view}
                type="button"
                onClick={() => onNavigate(view, items.map(i => i.code))}
                disabled={items.length === 0}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full border border-border bg-paper text-[11px] font-medium text-muted hover:text-ink hover:border-ink transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
