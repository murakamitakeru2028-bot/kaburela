const MOCK_PAIRS = [
  { codeA: '8035', nameA: '東京エレクトロン', codeB: '6857', nameB: 'アドバンテスト', corr: 0.91 },
  { codeA: '7203', nameA: 'トヨタ自動車',     codeB: '7267', nameB: 'ホンダ',         corr: 0.87 },
  { codeA: '6758', nameA: 'ソニーG',           codeB: '6752', nameB: 'パナソニックHD', corr: 0.81 },
  { codeA: '8306', nameA: '三菱UFJ FG',        codeB: '8316', nameB: '三井住友FG',    corr: 0.79 },
  { codeA: '7974', nameA: '任天堂',             codeB: '9697', nameB: 'カプコン',       corr: 0.73 },
  { codeA: '9984', nameA: 'ソフトバンクG',     codeB: '4385', nameB: 'メルカリ',       corr: -0.42 },
]

export function Sidebar() {
  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-4 py-3 border-b border-[#f0f0f5]">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">
          高相関ペア
        </p>
      </div>

      {/* ペアリスト */}
      <div className="flex-1 overflow-auto">
        {MOCK_PAIRS.map((pair, i) => (
          <div
            key={i}
            className="px-4 py-3 flex items-center gap-3 border-b border-[#f5f5f7] hover:bg-[#fafafa] transition-colors cursor-default"
          >
            <span className="text-[11px] text-muted font-mono w-4 shrink-0 text-right tabular-nums">
              {i + 1}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-ink truncate leading-snug">{pair.nameA}</p>
              <p className="text-[12px] font-medium text-ink truncate leading-snug">{pair.nameB}</p>
              <p className="text-[10px] text-muted font-mono mt-0.5">
                {pair.codeA} · {pair.codeB}
              </p>
            </div>

            <span
              className="text-[13px] font-mono font-semibold shrink-0 tabular-nums"
              style={{ color: pair.corr >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
            >
              {pair.corr >= 0 ? '+' : ''}{pair.corr.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
