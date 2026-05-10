export type Period = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y'

export const PERIODS: Period[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y']

export const SECTORS = [
  '電気機器',
  '輸送用機器',
  '銀行業',
  '情報・通信業',
  '医薬品',
  '食料品',
  '化学',
  '機械',
  '小売業',
  '不動産業',
  '電気・ガス業',
]

export interface FilterState {
  minCorr: number
  selectedSectors: string[]
}

export const DEFAULT_FILTER: FilterState = {
  minCorr: 0,
  selectedSectors: [...SECTORS],
}
