export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
}

export function corrToFill(corr: number, isDark: boolean): string {
  const base = isDark ? [44, 44, 46] as const : [251, 251, 249] as const
  if (corr >= 0) {
    const [pr, pg, pb] = isDark ? [52, 208, 88] as const : [22, 163, 74] as const
    return `rgb(${lerp(base[0], pr, corr)},${lerp(base[1], pg, corr)},${lerp(base[2], pb, corr)})`
  }
  const t = -corr
  const [nr, ng, nb] = isDark ? [255, 69, 58] as const : [220, 38, 38] as const
  return `rgb(${lerp(base[0], nr, t)},${lerp(base[1], ng, t)},${lerp(base[2], nb, t)})`
}

export function corrToTextFill(corr: number, isDark: boolean): string {
  if (isDark) return Math.abs(corr) > 0.15 ? 'rgba(255,255,255,0.92)' : 'rgba(245,245,247,0.5)'
  return Math.abs(corr) > 0.52 ? 'rgba(255,255,255,0.92)' : 'rgba(29,29,31,0.72)'
}
