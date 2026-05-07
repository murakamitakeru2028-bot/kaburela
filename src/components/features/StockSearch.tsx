import { useState, useRef, useEffect } from 'react'
import type { Stock } from '../../types/stock'
import { MOCK_STOCKS } from '../../data/mockStocks'
import { Badge } from '../ui'
import { cn } from '../../lib/cn'

interface Props {
  selected: Stock[]
  onAdd: (stock: Stock) => void
}

export function StockSearch({ selected, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = MOCK_STOCKS.filter(
    (s) => !query || s.code.includes(query) || s.name.includes(query),
  ).slice(0, 8)

  const isSelected = (code: string) => selected.some((s) => s.code === code)

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'h-8 w-52 rounded-[10px] bg-subtle flex items-center px-2.5 gap-2 transition-all',
          isOpen && 'ring-2 ring-ink/10 bg-paper',
        )}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0 text-muted">
          <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
          <path d="M9 9L11.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="コード・銘柄名で検索"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true) }}
          onFocus={() => setIsOpen(true)}
          className="flex-1 text-[12px] bg-transparent outline-none text-ink placeholder:text-muted min-w-0"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="w-4 h-4 rounded-full bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-colors shrink-0"
          >
            <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
              <path d="M1 1L6 6M6 1L1 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="text-muted" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] left-0 w-76 bg-paper rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] z-50 overflow-hidden">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-muted text-center">
              該当する銘柄が見つかりません
            </p>
          ) : (
            filtered.map((stock) => {
              const already = isSelected(stock.code)
              return (
                <button
                  key={stock.code}
                  onClick={() => {
                    if (already) return
                    onAdd(stock)
                    setQuery('')
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    already ? 'opacity-40 cursor-default' : 'hover:bg-[#f5f5f7] cursor-pointer',
                  )}
                >
                  <span className="text-[11px] font-mono text-muted w-9 shrink-0 tabular-nums">{stock.code}</span>
                  <span className="text-[13px] text-ink flex-1 min-w-0 truncate">{stock.name}</span>
                  <Badge variant="sector">{stock.sector}</Badge>
                  {already && (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                      <path d="M2 7L5 10L11 4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
