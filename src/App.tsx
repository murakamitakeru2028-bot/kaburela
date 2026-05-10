import { useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './lib/ThemeContext'
import { Header } from './components/layout/Header'
import { LoadingView, ErrorView } from './components/layout/StatusViews'
import { DataSummaryBar } from './components/layout/DataSummaryBar'
import { HomeView } from './components/home/HomeView'
import { SectorHeatmaps } from './components/charts/SectorHeatmaps'
import { NetworkGraph } from './components/charts/NetworkGraph'
import { RankingView } from './components/charts/RankingView'
import { ChartView } from './components/charts/ChartView'
import { MacroHeatmap } from './components/charts/MacroHeatmap'
import { TABS, type View } from './components/layout/tabConfig'
import { DEFAULT_FILTER, type Period, type FilterState } from './types/filter'
import { fetchSectors, fetchCorrelation, fetchMacro, fetchHealth, type SectorData, type CorrelationResponse, type MacroResponse, type HealthResponse } from './lib/api'
import type { StockInfo } from './types/stock'

interface MarketState {
  period: Period
  sectors: SectorData[]
  correlation: CorrelationResponse | null
  error: string | null
}

interface MacroState {
  period: Period
  data: MacroResponse | null
}

const EMPTY_SECTORS: SectorData[] = []
const VIEW_LABELS = Object.fromEntries(TABS.map(tab => [tab.id, tab.label])) as Record<View, string>

function AppInner() {
  const [currentView, setCurrentView] = useState<View>('home')
  const [period, setPeriod] = useState<Period>('6M')
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [chartInitialStock, setChartInitialStock] = useState<StockInfo | null>(null)
  const [chartReturnView, setChartReturnView] = useState<View | null>(null)
  const [market, setMarket] = useState<MarketState>({
    period: '6M',
    sectors: [],
    correlation: null,
    error: null,
  })
  const [macro, setMacro] = useState<MacroState | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchSectors(period), fetchCorrelation(period)])
      .then(([sectorData, corrData]) => {
        if (cancelled) return
        setMarket({ period, sectors: sectorData, correlation: corrData, error: null })
      })
      .catch((err: Error) => {
        if (cancelled) return
        setMarket({ period, sectors: [], correlation: null, error: err.message })
      })

    return () => { cancelled = true }
  }, [period])

  useEffect(() => {
    let cancelled = false
    fetchHealth()
      .then(data => {
        if (!cancelled) setHealth(data)
      })
      .catch(() => {
        if (!cancelled) setHealth(null)
      })
    return () => { cancelled = true }
  }, [period])

  useEffect(() => {
    if (currentView !== 'macro') return
    let cancelled = false
    fetchMacro(period)
      .then(data => {
        if (!cancelled) setMacro({ period, data })
      })
      .catch(() => {
        if (!cancelled) setMacro({ period, data: null })
      })
    return () => { cancelled = true }
  }, [period, currentView])

  const isLoading = market.period !== period
  const sectors = market.period === period ? market.sectors : EMPTY_SECTORS
  const correlation = market.period === period ? market.correlation : null
  const error = market.period === period ? market.error : null

  const sectorNames = useMemo(() => sectors.map(s => s.name), [sectors])
  const effectiveFilter = useMemo<FilterState>(() => {
    if (!sectorNames.length) return filter
    const selected = filter.selectedSectors.filter(name => sectorNames.includes(name))
    return {
      ...filter,
      selectedSectors: selected.length ? selected : sectorNames,
    }
  }, [filter, sectorNames])

  const filteredSectors = useMemo(
    () => sectors.filter(s => effectiveFilter.selectedSectors.includes(s.name)),
    [sectors, effectiveFilter.selectedSectors],
  )

  const filteredCorrelation = useMemo(() => {
    if (currentView !== 'network') return null
    if (!correlation) return null
    const selectedCodes = new Set(filteredSectors.flatMap(s => s.stocks.map(st => st.code)))
    if (selectedCodes.size === correlation.stocks.length) return correlation
    const idx = correlation.stocks
      .map((s, i) => (selectedCodes.has(s.code) ? i : -1))
      .filter(i => i >= 0)
    return {
      stocks: idx.map(i => correlation.stocks[i]),
      matrix: idx.map(i => idx.map(j => correlation.matrix[i][j])),
    }
  }, [currentView, correlation, filteredSectors])

  function renderMain() {
    if (currentView === 'home') {
      return <HomeView onNavigate={handleViewChange} sectors={sectors} correlation={correlation} />
    }
    if (isLoading) return <LoadingView />
    if (error) return <ErrorView message={error} />

    if (currentView === 'heatmap') {
      return <SectorHeatmaps sectors={filteredSectors} minCorr={effectiveFilter.minCorr} onStockSelect={handleSearchSelect} />
    }
    if (currentView === 'network' && filteredCorrelation) {
      return (
        <NetworkGraph
          stocks={filteredCorrelation.stocks}
          matrix={filteredCorrelation.matrix}
          minCorr={effectiveFilter.minCorr}
          sectors={filteredSectors}
          period={period}
          onStockSelect={handleSearchSelect}
        />
      )
    }
    if (currentView === 'ranking') {
      return (
        <RankingView
          sectors={filteredSectors}
          correlation={correlation}
          minCorr={effectiveFilter.minCorr}
          onStockSelect={handleSearchSelect}
        />
      )
    }
    if (currentView === 'chart') {
      return (
        <ChartView
          key={chartInitialStock?.code ?? 'none'}
          period={period}
          onPeriodChange={setPeriod}
          initialStock={chartInitialStock}
          sectors={sectors}
          correlation={correlation}
          onBack={chartReturnView ? handleChartBack : undefined}
          backLabel={chartReturnView ? VIEW_LABELS[chartReturnView] : undefined}
        />
      )
    }
    if (currentView === 'macro') {
      if (macro?.period !== period || !macro.data) {
        return (
          <div className="h-full flex items-center justify-center">
            <p className="text-[13px] text-muted">マクロデータを読み込み中...</p>
          </div>
        )
      }
      return <MacroHeatmap data={macro.data} sectors={filteredSectors} onStockSelect={handleSearchSelect} />
    }
    return null
  }

  function handleSearchSelect(stock: StockInfo) {
    setChartInitialStock(stock)
    setChartReturnView(currentView === 'chart' ? chartReturnView : currentView)
    setCurrentView('chart')
  }

  function handleChartBack() {
    setCurrentView(chartReturnView ?? 'home')
    setChartReturnView(null)
  }

  function handleViewChange(view: View) {
    setCurrentView(view)
    if (view !== 'chart') setChartReturnView(null)
  }

  const isNetworkActive = currentView === 'network' && !isLoading && !error && filteredCorrelation !== null

  return (
    <div className="h-screen flex flex-col bg-bg font-sans overflow-hidden">
      <div className="h-8 shrink-0 relative z-40">
        <Header
          currentView={currentView}
          onViewChange={handleViewChange}
          period={period}
          onPeriodChange={setPeriod}
          filter={effectiveFilter}
          onFilterChange={setFilter}
          onSearchSelect={handleSearchSelect}
        />
      </div>
      <div className="flex flex-1 overflow-hidden px-[clamp(24px,8vw,72px)] sm:px-[96px] lg:px-[144px] xl:px-[192px] py-4">
        <main className={`flex-1 flex flex-col ${isNetworkActive ? 'overflow-hidden' : 'overflow-auto'}`}>
          {currentView !== 'home' && !isLoading && !error && (
            <DataSummaryBar
              view={currentView}
              period={period}
              sectors={filteredSectors}
              correlation={correlation}
              health={health}
            />
          )}
          <div className="min-h-0 flex-1">
            {renderMain()}
          </div>
        </main>
      </div>
    </div>
  )
}

function App() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark(d => !d) }}>
      <AppInner />
    </ThemeContext.Provider>
  )
}

export default App
