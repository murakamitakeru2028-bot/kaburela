export interface HeatmapStock {
  code: string
  name: string
  label: string  /* 軸ラベル用の短縮名 */
}

export const MOCK_HEATMAP_STOCKS: HeatmapStock[] = [
  { code: '7203', name: 'トヨタ自動車',     label: 'トヨタ' },
  { code: '6758', name: 'ソニーグループ',   label: 'ソニーG' },
  { code: '7974', name: '任天堂',           label: '任天堂' },
  { code: '8035', name: '東京エレクトロン', label: '東エレク' },
  { code: '7267', name: 'ホンダ',           label: 'ホンダ' },
  { code: '6857', name: 'アドバンテスト',   label: 'アドバン' },
]

/* 対称行列 — 対角線は自己相関 1.00 */
export const MOCK_CORRELATION_MATRIX: number[][] = [
  [ 1.00,  0.65,  0.32,  0.58,  0.87,  0.61],
  [ 0.65,  1.00,  0.54,  0.78,  0.63,  0.76],
  [ 0.32,  0.54,  1.00,  0.48,  0.28,  0.45],
  [ 0.58,  0.78,  0.48,  1.00,  0.55,  0.91],
  [ 0.87,  0.63,  0.28,  0.55,  1.00,  0.59],
  [ 0.61,  0.76,  0.45,  0.91,  0.59,  1.00],
]
