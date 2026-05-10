export type View = 'home' | 'trend' | 'heatmap' | 'network' | 'macro' | 'ranking' | 'chart'

export const TABS: { id: View; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'trend', label: 'トレンド' },
  { id: 'heatmap', label: 'ヒートマップ' },
  { id: 'network', label: 'ネットワーク' },
  { id: 'macro', label: 'マクロ' },
  { id: 'ranking', label: 'ランキング' },
  { id: 'chart', label: 'チャート' },
]

export const TAB_DESCS: Record<View, string> = {
  home: '各分析ビューの概要とマーケットの現在地を確認します。',
  trend: '短期相関と長期相関を比べて、最近つながりが変わった銘柄ペアを表示します。',
  heatmap: 'セクターごとの銘柄相関を色のまとまりで表示します。',
  network: '相関の強い銘柄同士をノードとリンクで表示します。',
  macro: '為替、指数、金利、商品と銘柄・セクターの連動を表示します。',
  ranking: '相関係数の高いペア、低いペアをランキング形式で表示します。',
  chart: '銘柄を検索して追加し、価格推移やリターンを比較します。',
}
