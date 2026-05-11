import { useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './lib/ThemeContext'
import { Header } from './components/layout/Header'
import { LoadingView, ErrorView } from './components/layout/StatusViews'
import { DataSummaryBar } from './components/layout/DataSummaryBar'
import { HomeView } from './components/home/HomeView'
import { TrendView } from './components/charts/TrendView'
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

type PeriodByView = Partial<Record<View, Period>>
type MarketCache = Partial<Record<Period, MarketState>>
type MacroCache = Partial<Record<Period, MacroState>>

const EMPTY_SECTORS: SectorData[] = []
const VIEW_LABELS = Object.fromEntries(TABS.map(tab => [tab.id, tab.label])) as Record<View, string>

function AppInner() {
  const [currentView, setCurrentView] = useState<View>('home')
  const [periodByView, setPeriodByView] = useState<PeriodByView>({ home: '6M' })
  const [filter] = useState<FilterState>(DEFAULT_FILTER)
  const [chartInitialStock, setChartInitialStock] = useState<StockInfo | null>(null)
  const [chartReturnView, setChartReturnView] = useState<View | null>(null)
  const [marketCache, setMarketCache] = useState<MarketCache>({})
  const [macroCache, setMacroCache] = useState<MacroCache>({})
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const period = periodByView[currentView] ?? '6M'
  const cachedMarket = marketCache[period]
  const cachedMacro = macroCache[period]

  function setCurrentPeriod(nextPeriod: Period) {
    setPeriodByView(prev => ({ ...prev, [currentView]: nextPeriod }))
  }

  useEffect(() => {
    if (cachedMarket) return
    let cancelled = false
    Promise.all([fetchSectors(period), fetchCorrelation(period)])
      .then(([sectorData, corrData]) => {
        if (cancelled) return
        setMarketCache(prev => ({
          ...prev,
          [period]: { period, sectors: sectorData, correlation: corrData, error: null },
        }))
      })
      .catch((err: Error) => {
        if (cancelled) return
        setMarketCache(prev => ({
          ...prev,
          [period]: { period, sectors: [], correlation: null, error: err.message },
        }))
      })

    return () => { cancelled = true }
  }, [period, cachedMarket])

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
  }, [])

  useEffect(() => {
    if (currentView !== 'macro') return
    if (cachedMacro) return
    let cancelled = false
    fetchMacro(period)
      .then(data => {
        if (!cancelled) {
          setMacroCache(prev => ({ ...prev, [period]: { period, data } }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMacroCache(prev => ({ ...prev, [period]: { period, data: null } }))
        }
      })
    return () => { cancelled = true }
  }, [period, currentView, cachedMacro])

  const market = cachedMarket
  const isLoading = !market
  const sectors = market?.sectors ?? EMPTY_SECTORS
  const correlation = market?.correlation ?? null
  const error = market?.error ?? null

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
      return <HomeView onNavigate={handleViewChange} sectors={sectors} correlation={correlation} health={health} period={period} />
    }
    if (isLoading) return <LoadingView />
    if (error) return <ErrorView message={error} />

    if (currentView === 'trend') {
      return (
        <TrendView
          period={period}
          sectors={filteredSectors}
          minCorr={effectiveFilter.minCorr}
          onStockSelect={handleSearchSelect}
        />
      )
    }
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
          onPeriodChange={setCurrentPeriod}
          initialStock={chartInitialStock}
          sectors={sectors}
          correlation={correlation}
          onBack={chartReturnView ? handleChartBack : undefined}
          backLabel={chartReturnView ? VIEW_LABELS[chartReturnView] : undefined}
        />
      )
    }
    if (currentView === 'macro') {
      const macro = cachedMacro
      if (!macro?.data) {
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
    setPeriodByView(prev => ({ ...prev, chart: prev[currentView] ?? '6M' }))
    setCurrentView('chart')
  }

  function handleChartBack() {
    setCurrentView(chartReturnView ?? 'home')
    setChartReturnView(null)
  }

  function handleViewChange(view: View) {
    setPeriodByView(prev => (prev[view] ? prev : { ...prev, [view]: prev[currentView] ?? '6M' }))
    setCurrentView(view)
    if (view !== 'chart') setChartReturnView(null)
  }

  const isNetworkActive = currentView === 'network' && !isLoading && !error && filteredCorrelation !== null

  return (
    <div className="h-dvh min-h-[480px] flex flex-col bg-bg font-sans overflow-hidden">
      <div className="h-11 sm:h-8 shrink-0 relative z-40">
        <Header
          currentView={currentView}
          onViewChange={handleViewChange}
          onSearchSelect={handleSearchSelect}
        />
      </div>
      <div className="flex flex-1 overflow-hidden px-3 py-3 sm:px-6 sm:py-4 md:px-10 lg:px-16 xl:px-24 2xl:px-32">
        <main className={`min-w-0 flex-1 flex flex-col ${isNetworkActive ? 'overflow-hidden' : 'overflow-auto'}`}>
          {currentView !== 'home' && !error && (
            <DataSummaryBar
              view={currentView}
              period={period}
              onPeriodChange={currentView === 'chart' ? undefined : setCurrentPeriod}
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
