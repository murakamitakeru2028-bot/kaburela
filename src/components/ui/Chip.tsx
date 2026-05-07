interface ChipProps {
  name: string
  code: string
  onRemove?: () => void
}

export function Chip({ name, code, onRemove }: ChipProps) {
  return (
    <div className="inline-flex items-center gap-1.5 h-7 pl-3 pr-1.5 rounded-full bg-subtle text-[12px] font-medium text-ink shrink-0">
      <span className="leading-none">{name}</span>
      <span className="text-muted font-mono text-[11px] leading-none">{code}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`${name}を削除`}
          className="w-4 h-4 ml-0.5 rounded-full bg-[#c8c8ce] hover:bg-[#aeaeb2] flex items-center justify-center transition-colors shrink-0"
        >
          <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
            <path d="M1 1L6 6M6 1L1 6" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
