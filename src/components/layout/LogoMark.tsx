import { useTheme } from '../../lib/ThemeContext'

interface LogoMarkProps {
  size?: number
  className?: string
}

export function LogoMark({ size = 20, className }: LogoMarkProps) {
  const { isDark } = useTheme()
  const fills = isDark
    ? ['#f5f5f7', '#98989d', '#48484a', '#98989d', '#f5f5f7', '#636366', '#48484a', '#636366', '#f5f5f7']
    : ['#1d1d1f', '#6e6e73', '#c7c7cc', '#6e6e73', '#1d1d1f', '#aeaeb2', '#c7c7cc', '#aeaeb2', '#1d1d1f']

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      {fills.map((fill, i) => (
        <rect key={i} x={1 + (i % 3) * 6} y={1 + Math.floor(i / 3) * 6} width="5" height="5" fill={fill} rx="1" />
      ))}
    </svg>
  )
}
