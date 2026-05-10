export type View = 'home' | 'heatmap' | 'network' | 'macro' | 'ranking' | 'chart'

export const TABS: { id: View; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'heatmap', label: 'ヒートマップ' },
  { id: 'network', label: 'ネットワーク' },
  { id: 'macro', label: 'マクロ' },
  { id: 'ranking', label: 'ランキング' },
  { id: 'chart', label: 'チャート' },
]

export const TAB_DESCS: Record<View, string> = {
  home: '各ビューの概要から分析を始められます。',
  heatmap: 'セクターごとの銘柄相関をヒートマップで表示します。',
  network: '相関の強い銘柄同士をネットワーク図で表示します。',
  macro: '為替・指数・商品ごとに相関の強い上位銘柄を表示します。',
  ranking: '相関係数の高いペアをランキング形式で表示します。',
  chart: '銘柄を検索して追加し、価格推移を比較します。',
}
