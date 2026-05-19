import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { LoginModal } from '../components/auth/LoginModal'

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''

export interface AuthUser {
  email: string
  name: string
  picture?: string
}

interface AuthContextValue {
  user: AuthUser | null
  userId: string | null
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userId: null,
  login: () => {},
  logout: () => {},
})

// Google JWTのペイロードをフロントエンドでデコード（署名検証なし）
function decodeGoogleJwt(credential: string): { sub: string; email: string; name: string; picture?: string } {
  const payload = credential.split('.')[1]
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  // atob()はバイナリ文字列を返すため、TextDecoderでUTF-8として正しく変換する
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as { sub: string; email: string; name: string; picture?: string }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('auth_user')
    if (!stored) return null
    try { return JSON.parse(stored) as AuthUser } catch { return null }
  })
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem('auth_user_id'))
  const [showModal, setShowModal] = useState(false)
  const gisReady = useRef(false)

  const handleCredential = useCallback((credential: string) => {
    try {
      const idinfo = decodeGoogleJwt(credential)
      const u: AuthUser = { email: idinfo.email, name: idinfo.name, picture: idinfo.picture }
      localStorage.setItem('auth_user', JSON.stringify(u))
      localStorage.setItem('auth_user_id', idinfo.sub)
      setUser(u)
      setUserId(idinfo.sub)
    } catch (e) {
      console.error('ログインエラー:', e)
    }
  }, [])

  // ログイン成功時にモーダルを自動で閉じる
  useEffect(() => {
    if (user) setShowModal(false)
  }, [user])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    function initGIS() {
      if (!window.google) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => handleCredential(response.credential),
        auto_select: false,
      })
      gisReady.current = true
    }

    if (window.google) {
      initGIS()
      return
    }

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (existing) {
      existing.addEventListener('load', initGIS)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initGIS
    document.head.appendChild(script)
  }, [handleCredential])

  const login = useCallback(() => {
    setShowModal(true)
  }, [])

  const logout = useCallback(() => {
    if (window.google) window.google.accounts.id.disableAutoSelect()
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_user_id')
    setUser(null)
    setUserId(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, userId, login, logout }}>
      {children}
      {showModal && <LoginModal onClose={() => setShowModal(false)} />}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
