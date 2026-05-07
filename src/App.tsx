import { useState } from 'react'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { Heatmap } from './components/charts/Heatmap'
import { MOCK_HEATMAP_STOCKS, MOCK_CORRELATION_MATRIX } from './data/mockCorrelation'
import type { View } from './components/layout/TabNav'
import { DEFAULT_FILTER, type Period, type FilterState } from './types/filter'

/* ホーム画面 */
function HomeView() {
  const fills = [
    '#1d1d1f', '#6e6e73', '#c7c7cc',
    '#6e6e73', '#1d1d1f', '#aeaeb2',
    '#c7c7cc', '#aeaeb2', '#1d1d1f',
  ]
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-subtle flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
          {fills.map((fill, i) => (
            <rect key={i} x={(i % 3) * 9 + 1} y={Math.floor(i / 3) * 9 + 1} width="7" height="7" fill={fill} rx="1" />
          ))}
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[20px] font-semibold text-ink tracking-[-0.3px]">Kaburela</h2>
        <p className="text-[13px] text-muted max-w-xs leading-relaxed">
          東証上場銘柄の相関係数をヒートマップで可視化する分析ツール
        </p>
      </div>
      <p className="text-[12px] text-muted">
        ヘッダーの「ヒートマップ」から分析を開始できます
      </p>
    </div>
  )
}

function App() {
  const [currentView, setCurrentView] = useState<View>('home')
  const [period, setPeriod] = useState<Period>('6M')
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)

  return (
    <div className="h-screen flex flex-col bg-bg font-sans overflow-hidden">
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        period={period}
        onPeriodChange={setPeriod}
        filter={filter}
        onFilterChange={setFilter}
      />

      <div className="flex flex-1 overflow-hidden p-3 gap-3">
        <main className="flex-1 bg-paper rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] overflow-auto">
          {currentView === 'home' ? (
            <HomeView />
          ) : (
            <Heatmap stocks={MOCK_HEATMAP_STOCKS} matrix={MOCK_CORRELATION_MATRIX} />
          )}
        </main>

        <div className="w-64 shrink-0 bg-paper rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] overflow-hidden">
          <Sidebar />
        </div>
      </div>
    </div>
  )
}

export default App
