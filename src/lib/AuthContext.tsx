import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { authenticateWithGoogle } from './api'

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''

export interface AuthUser {
  email: string
  name: string
  picture?: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('auth_user')
    if (!stored) return null
    try { return JSON.parse(stored) as AuthUser } catch { return null }
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'))
  const gisReady = useRef(false)

  const handleCredential = useCallback(async (credential: string) => {
    try {
      const data = await authenticateWithGoogle(credential)
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('auth_user', JSON.stringify(data.user))
      setToken(data.token)
      setUser(data.user)
    } catch (e) {
      console.error('ログインエラー:', e)
    }
  }, [])

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

    // GISスクリプトが未読み込みの場合は動的に追加
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
    if (!gisReady.current || !window.google) return
    window.google.accounts.id.prompt()
  }, [])

  const logout = useCallback(() => {
    if (window.google) window.google.accounts.id.disableAutoSelect()
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
