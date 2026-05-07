import type { Stock } from '../../types/stock'
import { Chip } from '../ui'

interface Props {
  stocks: Stock[]
  onRemove: (code: string) => void
}

export function StockBar({ stocks, onRemove }: Props) {
  return (
    <div className="shrink-0 bg-paper/60 backdrop-blur-xl flex items-center gap-3 px-5 h-10 overflow-x-auto shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      {stocks.length === 0 ? (
        <span className="text-[12px] text-muted whitespace-nowrap">
          銘柄を追加してください
        </span>
      ) : (
        <>
          <span className="text-[11px] font-mono text-muted shrink-0 whitespace-nowrap tabular-nums">
            {stocks.length}銘柄
          </span>
          <div className="w-px h-3.5 bg-border shrink-0" />
          <div className="flex items-center gap-1.5">
            {stocks.map((s) => (
              <Chip key={s.code} name={s.name} code={s.code} onRemove={() => onRemove(s.code)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
