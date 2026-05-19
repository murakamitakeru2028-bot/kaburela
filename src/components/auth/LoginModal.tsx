import { useEffect, useRef } from 'react'
import { useTheme } from '../../lib/ThemeContext'

interface Props {
  onClose: () => void
}

export function LoginModal({ onClose }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    function render() {
      if (!buttonRef.current || !window.google) return
      // コンテナをクリアしてから再レンダリング
      buttonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: isDark ? 'filled_black' : 'outline',
        size: 'large',
        text: 'signin_with',
        locale: 'ja',
        shape: 'rectangular',
        width: 240,
      })
    }

    if (window.google) {
      render()
      return
    }

    // GISスクリプトのロード待ち
    const timer = setInterval(() => {
      if (window.google) {
        render()
        clearInterval(timer)
      }
    }, 100)
    return () => clearInterval(timer)
  }, [isDark])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-paper rounded-3xl p-8 shadow-[0_24px_64px_rgba(0,0,0,0.22)] flex flex-col items-center gap-6 w-80 mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center">
          <p className="text-[15px] font-semibold text-ink mb-1.5">Kaburela にログイン</p>
          <p className="text-[13px] text-muted leading-relaxed">
            マイリストの保存・復元に<br />Googleアカウントを使用します
          </p>
        </div>

        {/* Googleが描画するボタン */}
        <div ref={buttonRef} className="flex justify-center min-h-[44px] items-center" />

        <button
          type="button"
          onClick={onClose}
          className="text-[12px] text-muted hover:text-ink transition-colors cursor-pointer"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
