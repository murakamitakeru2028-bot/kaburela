import { useMemo } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { corrToFill } from '../../lib/colorUtils'
import type { View } from '../layout/tabConfig'
import type { SectorData, CorrelationResponse } from '../../lib/api'

interface Props {
  onNavigate: (view: View) => void
  sectors: SectorData[]
  correlation: CorrelationResponse | null
}

function MiniCorrGrid({ matrix, isDark, cellSize = 17 }: {
  matrix: number[][]
  isDark: boolean
  cellSize?: number
}) {
  const S = cellSize
  const G = 3
  const total = matrix.length * S + (matrix.length - 1) * G
  return (
    <svg width={total} height={total} style={{ display: 'block' }}>
      {matrix.map((row, r) => row.map((val, c) => (
        <rect
          key={`${r}-${c}`}
          x={c * (S + G)}
          y={r * (S + G)}
          width={S}
          height={S}
          rx={4}
          fill={corrToFill(val, isDark)}
        />
      )))}
    </svg>
  )
}

function MiniNetworkSvg({ stocks, matrix, isDark }: {
  stocks: CorrelationResponse['stocks']
  matrix: number[][]
  isDark: boolean
}) {
  const N = Math.min(stocks.length, 12)
  const W = 240
  const H = 160
  const cx = W / 2
  const cy = H / 2
  const r = 60
  const pos = Array.from({ length: N }, (_, i) => ({
    x: cx + r * Math.cos(2 * Math.PI * i / N - Math.PI / 2),
    y: cy + r * Math.sin(2 * Math.PI * i / N - Math.PI / 2),
  }))

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {Array.from({ length: N }, (_, i) =>
        Array.from({ length: N }, (_, j) => {
          if (j <= i) return null
          const c = matrix[i]?.[j] ?? 0
          if (Math.abs(c) < 0.55) return null
          return (
            <line
              key={`${i}-${j}`}
              x1={pos[i].x}
              y1={pos[i].y}
              x2={pos[j].x}
              y2={pos[j].y}
              stroke={c >= 0 ? (isDark ? '#34d058' : '#16a34a') : (isDark ? '#ff453a' : '#dc2626')}
              strokeWidth={Math.abs(c) * 3.5}
              strokeOpacity={0.3 + Math.abs(c) * 0.5}
              strokeLinecap="round"
            />
          )
        })
      )}
      {pos.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={5}
          fill={isDark ? '#3a3a3c' : '#ffffff'}
          stroke={isDark ? '#636366' : '#c7c7cc'}
          strokeWidth={1.2}
        />
      ))}
    </svg>
  )
}

export function HomeView({ onNavigate, sectors, correlation }: Props) {
  const { isDark } = useTheme()
  const fills = isDark
    ? ['#f5f5f7', '#98989d', '#48484a', '#98989d', '#f5f5f7', '#636366', '#48484a', '#636366', '#f5f5f7']
    : ['#1d1d1f', '#6e6e73', '#c7c7cc', '#6e6e73', '#1d1d1f', '#aeaeb2', '#c7c7cc', '#aeaeb2', '#1d1d1f']

  const previewSector = sectors[0] ?? null

  const topPairs = useMemo(() => {
    if (!correlation) return []
    const { stocks, matrix } = correlation
    const pairs: { labelA: string; labelB: string; corr: number }[] = []
    for (let i = 0; i < stocks.length; i++)
      for (let j = i + 1; j < stocks.length; j++)
        pairs.push({ labelA: stocks[i].label, labelB: stocks[j].label, corr: matrix[i][j] })
    return pairs.sort((a, b) => b.corr - a.corr).slice(0, 5)
  }, [correlation])

  const cards: { view: View; label: string; desc: string; widget: React.ReactNode }[] = [
    {
      view: 'heatmap',
      label: 'ヒートマップ',
      desc: 'セクター別に銘柄間の相関係数をカラーマップで確認',
      widget: sectors.length >= 2 ? (
        <div className="flex gap-5 w-full justify-center">
          {sectors.slice(0, 2).map(sector => (
            <div key={sector.name} className="flex flex-col items-center gap-2">
              <MiniCorrGrid matrix={sector.matrix} isDark={isDark} cellSize={22} />
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sector.color }} />
                <span className="text-[9px] text-muted font-mono">{sector.name}</span>
              </div>
            </div>
          ))}
        </div>
      ) : previewSector ? (
        <div className="flex flex-col items-center gap-2">
          <MiniCorrGrid matrix={previewSector.matrix} isDark={isDark} cellSize={26} />
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: previewSector.color }} />
            <span className="text-[9px] text-muted font-mono">{previewSector.name}</span>
          </div>
        </div>
      ) : (
        <div className="w-full h-[90px] rounded-xl bg-subtle" />
      ),
    },
    {
      view: 'network',
      label: 'ネットワーク図',
      desc: '銘柄同士のつながりをノードとエッジで視覚的に把握',
      widget: correlation ? (
        <div className="flex flex-col items-center gap-1">
          <MiniNetworkSvg stocks={correlation.stocks} matrix={correlation.matrix} isDark={isDark} />
          <span className="text-[9px] text-muted font-mono">
            {correlation.stocks.length} 銘柄 ・ 相関 0.55 以上のエッジを表示
          </span>
        </div>
      ) : (
        <div className="w-[240px] h-[160px] rounded-xl bg-subtle" />
      ),
    },
    {
      view: 'ranking',
      label: 'ランキング',
      desc: '高相関・低相関のペアをランキング形式で一覧',
      widget: topPairs.length > 0 ? (
        <div className="flex flex-col gap-2.5 w-full">
          {topPairs.map((pair, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted font-mono w-3 shrink-0 tabular-nums">{i + 1}</span>
                <span className="text-[11px] text-ink font-mono flex-1 truncate">
                  {pair.labelA} × {pair.labelB}
                </span>
                <span className="text-[11px] font-mono font-semibold tabular-nums shrink-0" style={{ color: 'var(--color-pos)' }}>
                  +{pair.corr.toFixed(2)}
                </span>
              </div>
              <div className="ml-5 h-[3px] rounded-full overflow-hidden bg-subtle">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pair.corr * 100}%`, backgroundColor: 'var(--color-pos)', opacity: 0.55 }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 rounded-md bg-subtle" style={{ opacity: 1 - i * 0.18 }} />
          ))}
        </div>
      ),
    },
  ]

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 p-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-12 h-12 rounded-2xl bg-subtle flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden>
            {fills.map((fill, i) => (
              <rect key={i} x={(i % 3) * 9 + 1} y={Math.floor(i / 3) * 9 + 1} width="7" height="7" fill={fill} rx="1" />
            ))}
          </svg>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-semibold text-ink tracking-[-0.4px]">Kaburela</h2>
          <p className="text-[12px] text-muted max-w-xs leading-relaxed">
            東証上場銘柄の相関係数をヒートマップ・ネットワーク図で可視化する分析ツール
          </p>
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-5xl">
        {cards.map(({ view, label, desc, widget }, i) => (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className="flex-1 flex flex-col bg-paper rounded-2xl text-left cursor-pointer overflow-hidden
              shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]
              border border-border hover:border-muted"
            style={{
              minHeight: 300,
              animation: 'fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both',
              animationDelay: `${i * 70}ms`,
              transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease, border-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-[13px] font-semibold text-ink tracking-[-0.2px]">{label}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="text-muted">
                <path d="M4 7h6M7 4l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1 flex items-center justify-center px-4 py-2">
              {widget}
            </div>
            <div className="px-4 pb-4 border-t border-subtle pt-2">
              <span className="text-[11px] text-muted leading-relaxed">{desc}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
