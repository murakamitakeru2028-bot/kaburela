export function LoadingView() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-border border-t-ink rounded-full animate-spin" />
        <span className="text-[12px] text-muted">データ取得中...</span>
      </div>
    </div>
  )
}

export function ErrorView({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center p-8">
        <span className="text-[13px] font-medium" style={{ color: 'var(--color-neg)' }}>取得エラー</span>
        <span className="text-[12px] text-muted max-w-xs">{message}</span>
        <span className="text-[11px] text-muted mt-1">バックエンドが起動しているか確認してください</span>
      </div>
    </div>
  )
}
