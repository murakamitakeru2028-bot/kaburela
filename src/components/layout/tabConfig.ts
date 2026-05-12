export type View = 'home' | 'trend' | 'heatmap' | 'network' | 'macro' | 'ranking' | 'stockcorr' | 'chart'

export const TABS: { id: View; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'trend', label: 'トレンド' },
  { id: 'heatmap', label: 'ヒートマップ' },
  { id: 'network', label: 'ネットワーク' },
  { id: 'macro', label: 'マクロ' },
  { id: 'ranking', label: 'ランキング' },
  { id: 'stockcorr', label: '銘柄相関' },
  { id: 'chart', label: 'チャート' },
]
