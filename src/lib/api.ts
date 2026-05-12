import type { StockInfo } from '../types/stock'

export interface SectorData {
  name: string
  color: string
  stocks: StockInfo[]
  matrix: number[][]
}

export interface CorrelationResponse {
  stocks: StockInfo[]
  matrix: number[][]
}

export interface PairData {
  stockA: StockInfo
  stockB: StockInfo
  corr: number
}

export interface StockCorrelationPeer {
  stock: StockInfo
  corr: number
}

export interface StockCorrelationResponse {
  base: StockInfo
  period: string
  peers: StockCorrelationPeer[]
}

export interface ChartData {
  code: string
  dates: string[]
  closes: number[]
}

export interface MacroIndicator {
  code: string
  name: string
  label: string
  color: string
}

export interface MacroResponse {
  indicators: MacroIndicator[]
  stocks: StockInfo[]
  matrix: number[][]
}

export interface CompareResponse {
  stocks: Record<string, { dates: string[]; closes: number[] }>
  codes: string[]
  correlation: number[][]
}

export interface SectorIndexMeta {
  name: string
  color: string
  stockCount: number
}

export interface SectorIndexResponse {
  sectors: SectorIndexMeta[]
  matrix: number[][]
}

export interface HealthResponse {
  status: string
  last_batch?: {
    id: number
    started_at: string
    finished_at: string | null
    status: string
    detail: string | null
  } | null
}

type MasterSector = Pick<SectorData, 'name' | 'color' | 'stocks'>

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '')
const viteBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const dataBase = `${viteBase}/data`

let masterPromise: Promise<MasterSector[]> | null = null

async function jsonFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const detail = await res.json().then(d => d.detail).catch(() => res.statusText)
    throw new Error(detail ?? `Data request failed (${res.status})`)
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    const looksLikeHtml = text.trimStart().startsWith('<!doctype html') || text.trimStart().startsWith('<html')
    if (looksLikeHtml) {
      throw new Error(`データファイルが見つかりません: ${url}`)
    }
    throw new Error(`JSONを読み込めません: ${url}`)
  }
}

function apiFetch<T>(path: string): Promise<T> {
  if (!apiBase) throw new Error('VITE_API_BASE_URL is not configured')
  return jsonFetch(`${apiBase}${path}`)
}

function staticFetch<T>(path: string): Promise<T> {
  return jsonFetch(`${dataBase}${path}`)
}

function bySign(pair: PairData, sign: 'all' | 'pos' | 'neg'): boolean {
  if (sign === 'pos') return pair.corr > 0
  if (sign === 'neg') return pair.corr < 0
  return true
}

function calcCorr(closesA: number[], closesB: number[]): number {
  const n = Math.min(closesA.length, closesB.length) - 1
  if (n < 2) return 0
  const ra = closesA.slice(1, n + 1).map((v, i) => v / closesA[i] - 1)
  const rb = closesB.slice(1, n + 1).map((v, i) => v / closesB[i] - 1)
  const ma = ra.reduce((sum, value) => sum + value, 0) / n
  const mb = rb.reduce((sum, value) => sum + value, 0) / n
  const cov = ra.reduce((sum, value, i) => sum + (value - ma) * (rb[i] - mb), 0)
  const sa = Math.sqrt(ra.reduce((sum, value) => sum + (value - ma) ** 2, 0))
  const sb = Math.sqrt(rb.reduce((sum, value) => sum + (value - mb) ** 2, 0))
  return sa && sb ? parseFloat((cov / (sa * sb)).toFixed(4)) : 0
}

async function loadMaster(): Promise<MasterSector[]> {
  masterPromise ??= staticFetch<MasterSector[]>('/master.json')
  return masterPromise
}

export function fetchSectors(period: string): Promise<SectorData[]> {
  if (apiBase) return apiFetch(`/api/sectors?period=${period}`)
  return staticFetch(`/sectors/${period}.json`)
}

export function fetchCorrelation(period: string): Promise<CorrelationResponse> {
  if (apiBase) return apiFetch(`/api/correlation?period=${period}`)
  return staticFetch(`/correlation/${period}.json`)
}

export async function fetchRanking(
  period: string,
  sign: 'all' | 'pos' | 'neg' = 'all',
  limit = 50,
): Promise<PairData[]> {
  if (apiBase) return apiFetch(`/api/ranking?period=${period}&sign=${sign}&limit=${limit}`)
  const pairs = await staticFetch<PairData[]>(`/ranking/${period}.json`)
  return pairs.filter(pair => bySign(pair, sign)).slice(0, limit)
}

export function fetchChart(code: string, period: string): Promise<ChartData> {
  if (apiBase) return apiFetch(`/api/stocks/${encodeURIComponent(code)}/chart?period=${period}`)
  return staticFetch(`/charts/stocks/${period}/${encodeURIComponent(code)}.json`)
}

export function fetchStockCorrelations(code: string, period: string): Promise<StockCorrelationResponse> {
  if (apiBase) return apiFetch(`/api/stocks/${encodeURIComponent(code)}/correlations?period=${period}`)
  return staticFetch(`/stock-correlations/${period}/${encodeURIComponent(code)}.json`)
}

export function fetchSectorChart(sector: string, period: string): Promise<ChartData> {
  if (apiBase) return apiFetch(`/api/sectors/${encodeURIComponent(sector)}/chart?period=${period}`)
  return staticFetch(`/charts/sectors/${period}/${encodeURIComponent(sector)}.json`)
}

export function fetchMacro(period: string): Promise<MacroResponse> {
  if (apiBase) return apiFetch(`/api/macro?period=${period}`)
  return staticFetch(`/macro/${period}.json`)
}

export async function fetchCompare(codes: string[], period: string): Promise<CompareResponse> {
  if (apiBase) return apiFetch(`/api/stocks/compare?codes=${codes.map(encodeURIComponent).join(',')}&period=${period}`)

  const entries = await Promise.all(
    codes.map(async code => [code, await fetchChart(code, period)] as const),
  )
  const stocks = Object.fromEntries(
    entries.map(([code, chart]) => [code, { dates: chart.dates, closes: chart.closes }]),
  )
  const correlation = codes.map(codeA =>
    codes.map(codeB => {
      if (codeA === codeB) return 1
      return calcCorr(stocks[codeA]?.closes ?? [], stocks[codeB]?.closes ?? [])
    }),
  )

  return { stocks, codes, correlation }
}

export function fetchSectorIndices(period: string): Promise<SectorIndexResponse> {
  if (apiBase) return apiFetch(`/api/sector_indices?period=${period}`)
  return staticFetch(`/sector-indices/${period}.json`)
}

export async function searchStocksApi(q: string): Promise<StockInfo[]> {
  if (apiBase) return apiFetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)

  const query = q.trim().toLowerCase()
  if (!query) return []

  const sectors = await loadMaster()
  return sectors
    .flatMap(sector => sector.stocks)
    .filter(stock =>
      [stock.code, stock.name, stock.label].some(value =>
        value.toLowerCase().includes(query),
      ),
    )
    .slice(0, 20)
}

export function fetchHealth(): Promise<HealthResponse> {
  if (apiBase) return apiFetch('/health')
  return staticFetch('/health.json')
}
