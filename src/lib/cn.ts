/** Tailwindクラスを条件付きで結合するユーティリティ */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
