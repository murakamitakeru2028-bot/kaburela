import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { fetchWatchlist, addToWatchlist, removeFromWatchlist, searchStocksApi, type WatchlistItem } from '../../lib/api'
import type { SectorData } from '../../lib/api'
import type { StockInfo } from '../../types/stock'

interface WatchlistViewProps {
  sectors: SectorData[]
  onStockSelect: (stock: StockInfo) => void
  onLogin: () => void
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

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path
        d="M7.5 1L9.18 5.27L13.5 5.64L10.5 8.27L11.68 12.5L7.5 10.1L3.32 12.5L4.5 8.27L1.5 5.64L5.82 5.27L7.5 1Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function WatchlistView({ sectors, onStockSelect, onLogin }: WatchlistViewProps) {
  const { user, token } = useAuth()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StockInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const stockMap = buildStockMap(sectors)

  const loadWatchlist = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await fetchWatchlist(token)
      setItems(data)
    } catch (e) {
      console.error('マイリスト取得エラー:', e)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadWatchlist()
  }, [loadWatchlist])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await searchStocksApi(q)
        if (!cancelled) setSearchResults(results.slice(0, 6))
      } catch {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [searchQuery])

  const handleAdd = useCallback(async (code: string) => {
    if (!token) return
    try {
      const item = await addToWatchlist(code, token)
      setItems(prev => [item, ...prev.filter(i => i.code !== code)])
      setSearchQuery('')
      setSearchResults([])
    } catch (e) {
      console.error('追加エラー:', e)
    }
  }, [token])

  const handleRemove = useCallback(async (code: string) => {
    if (!token) return
    try {
      await removeFromWatchlist(code, token)
      setItems(prev => prev.filter(i => i.code !== code))
    } catch (e) {
      console.error('削除エラー:', e)
    }
  }, [token])

  // 未ログイン時
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
    <div className="h-full flex flex-col gap-4 pt-2">
      {/* 銘柄追加検索 */}
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
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="銘柄を検索して追加..."
            className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSearchResults([]) }}
              className="text-muted hover:text-ink cursor-pointer shrink-0"
              aria-label="クリア"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-paper rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.06)] z-10 overflow-hidden">
            {searchResults.map(stock => (
              <div
                key={stock.code}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle transition-colors"
              >
                <span className="text-[11px] font-mono text-muted w-10 shrink-0">{stock.code}</span>
                <span className="text-[13px] text-ink flex-1 truncate">{stock.name}</span>
                <button
                  type="button"
                  onClick={() => handleAdd(stock.code)}
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

      {/* リスト本体 */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-muted">読み込み中...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13px] text-muted">まだ銘柄がありません</p>
          <p className="text-[12px] text-muted">上の検索から追加してください</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto -mx-1 px-1">
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
                      {stock?.color && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stock.color }} />
                      )}
                      <span className="text-[11px] font-mono text-muted">{item.code}</span>
                    </div>
                    <p className="text-[13px] font-medium text-ink truncate mt-0.5">
                      {stock?.name ?? item.code}
                    </p>
                    {stock?.sector && (
                      <p className="text-[11px] text-muted truncate">{stock.sector}</p>
                    )}
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
