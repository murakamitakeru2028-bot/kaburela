import { lazy, memo, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { ThemeContext } from './lib/ThemeContext'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { Header } from './components/layout/Header'
import { LoadingView, ErrorView } from './components/layout/StatusViews'
import { DataSummaryBar } from './components/layout/DataSummaryBar'
import { HomeView } from './components/home/HomeView'
import { WatchlistView } from './components/watchlist/WatchlistView'
import { TABS, type View } from './components/layout/tabConfig'
import type { Period } from './types/filter'
import { fetchSectors, fetchCorrelation, fetchMacro, fetchHealth, type SectorData, type CorrelationResponse, type MacroResponse, type HealthResponse } from './lib/api'
import type { StockInfo } from './types/stock'

const TrendView = lazy(() => import('./components/charts/TrendView').then(module => ({ default: module.TrendView })))
const SectorHeatmaps = lazy(() => import('./components/charts/SectorHeatmaps').then(module => ({ default: module.SectorHeatmaps })))
const NetworkGraph = lazy(() => import('./components/charts/NetworkGraph').then(module => ({ default: module.NetworkGraph })))
const RankingView = lazy(() => import('./components/charts/RankingView').then(module => ({ default: module.RankingView })))
const ChartView = lazy(() => import('./components/charts/ChartView').then(module => ({ default: module.ChartView })))
const MacroHeatmap = lazy(() => import('./components/charts/MacroHeatmap').then(module => ({ default: module.MacroHeatmap })))

interface MarketState {
  period: Period
  sectors: SectorData[]
  correlation: CorrelationResponse | null
  error: string | null
}

interface MacroState {
  period: Period
  data: MacroResponse | null
  error: string | null
}

type PeriodByView = Partial<Record<View, Period>>
type MarketCache = Partial<Record<Period, MarketState>>
type MacroCache = Partial<Record<Period, MacroState>>

const EMPTY_SECTORS: SectorData[] = []
const MIN_CORR = 0
const VIEW_LABELS = Object.fromEntries(TABS.map(tab => [tab.id, tab.label])) as Record<View, string>

const AnimatedTabContent = memo(function AnimatedTabContent({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-h-0 tab-panel-motion">
      {children}
    </div>
  )
})

function AppInner() {
  const [currentView, setCurrentView] = useState<View>('home')
  const [periodByView, setPeriodByView] = useState<PeriodByView>({ home: '6M' })
  const [chartInitialStock, setChartInitialStock] = useState<StockInfo | null>(null)
  const [chartReturnView, setChartReturnView] = useState<View | null>(null)
  const [marketCache, setMarketCache] = useState<MarketCache>({})
  const [macroCache, setMacroCache] = useState<MacroCache>({})
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const { login } = useAuth()
  const period = periodByView[currentView] ?? '6M'
  const cachedMarket = marketCache[period]
  const cachedMacro = macroCache[period]

  const setCurrentPeriod = useCallback((nextPeriod: Period) => {
    setPeriodByView(prev => ({ ...prev, [currentView]: nextPeriod }))
  }, [currentView])

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
          setMacroCache(prev => ({ ...prev, [period]: { period, data, error: null } }))
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setMacroCache(prev => ({
            ...prev,
            [period]: { period, data: null, error: err.message || 'マクロデータを取得できませんでした' },
          }))
        }
      })
    return () => { cancelled = true }
  }, [period, currentView, cachedMacro])

  const market = cachedMarket
  const isLoading = !market
  const sectors = market?.sectors ?? EMPTY_SECTORS
  const correlation = market?.correlation ?? null
  const error = market?.error ?? null

  const networkCorrelation = currentView === 'network' ? correlation : null

  function renderMain() {
    if (currentView === 'home') {
      return (
        <AnimatedTabContent>
          <HomeView onNavigate={handleViewChange} sectors={sectors} correlation={correlation} health={health} period={period} />
        </AnimatedTabContent>
      )
    }
    if (isLoading) return <LoadingView />
    if (error) return <ErrorView message={error} />

    if (currentView === 'trend') {
      return (
        <AnimatedTabContent>
          <TrendView
            period={period}
            sectors={sectors}
            minCorr={MIN_CORR}
            onStockSelect={handleSearchSelect}
          />
        </AnimatedTabContent>
      )
    }
    if (currentView === 'heatmap') {
      return (
        <AnimatedTabContent>
          <SectorHeatmaps sectors={sectors} minCorr={MIN_CORR} onStockSelect={handleSearchSelect} />
        </AnimatedTabContent>
      )
    }
    if (currentView === 'network' && networkCorrelation) {
      return (
        <AnimatedTabContent>
          <NetworkGraph
            stocks={networkCorrelation.stocks}
            matrix={networkCorrelation.matrix}
            minCorr={MIN_CORR}
            sectors={sectors}
            period={period}
            onStockSelect={handleSearchSelect}
          />
        </AnimatedTabContent>
      )
    }
    if (currentView === 'ranking') {
      return (
        <AnimatedTabContent>
          <RankingView
            sectors={sectors}
            correlation={correlation}
            minCorr={MIN_CORR}
            onStockSelect={handleSearchSelect}
          />
        </AnimatedTabContent>
      )
    }
    if (currentView === 'chart') {
      return (
        <AnimatedTabContent>
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
        </AnimatedTabContent>
      )
    }
    if (currentView === 'watchlist') {
      return (
        <AnimatedTabContent>
          <WatchlistView sectors={sectors} correlation={correlation} onStockSelect={handleSearchSelect} onNavigate={handleViewChange} onLogin={login} />
        </AnimatedTabContent>
      )
    }
    if (currentView === 'macro') {
      const macro = cachedMacro
      if (macro?.error) {
        return <ErrorView message={macro.error} />
      }
      if (!macro?.data) {
        return (
          <div className="h-full flex items-center justify-center">
            <p className="text-[13px] text-muted">マクロデータを読み込み中...</p>
          </div>
        )
      }
      return (
        <AnimatedTabContent>
          <MacroHeatmap data={macro.data} sectors={sectors} onStockSelect={handleSearchSelect} />
        </AnimatedTabContent>
      )
    }
    return null
  }

  const handleSearchSelect = useCallback((stock: StockInfo) => {
    setChartInitialStock(stock)
    setChartReturnView(currentView === 'chart' ? chartReturnView : currentView)
    setPeriodByView(prev => ({ ...prev, chart: prev[currentView] ?? '6M' }))
    setCurrentView('chart')
  }, [currentView, chartReturnView])

  const handleChartBack = useCallback(() => {
    setCurrentView(chartReturnView ?? 'home')
    setChartReturnView(null)
  }, [chartReturnView])

  const handleViewChange = useCallback((view: View) => {
    setPeriodByView(prev => (prev[view] ? prev : { ...prev, [view]: prev[currentView] ?? '6M' }))
    setCurrentView(view)
    if (view !== 'chart') setChartReturnView(null)
  }, [currentView])

  const isNetworkActive = currentView === 'network' && !isLoading && !error && networkCorrelation !== null

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
          <div
            key={`${currentView}:${currentView === 'chart' ? chartInitialStock?.code ?? 'none' : ''}`}
            className="min-h-0 flex-1 flex flex-col"
          >
            {currentView !== 'home' && !error && (
              <div className="tab-summary-motion">
                <DataSummaryBar
                  view={currentView}
                  period={period}
                  sectors={sectors}
                  correlation={correlation}
                  health={health}
                />
              </div>
            )}
            <div className="min-h-0 flex-1">
              <Suspense fallback={<LoadingView />}>
                {renderMain()}
              </Suspense>
            </div>
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
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeContext.Provider>
  )
}

export default App
