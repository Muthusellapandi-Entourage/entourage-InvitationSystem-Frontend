import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { authApi } from '@/api/authApi'
import { setAccessTokenGetter, setUnauthorizedHandler } from '@/api/client'
import { clearSession, readSession, writeSession } from '@/stores/session'
import type { User } from '@/types/auth'

type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  status: AuthStatus
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const tokenRef = useRef<string | null>(readSession()?.accessToken ?? null)
  const [status, setStatus] = useState<AuthStatus>(() => (tokenRef.current ? 'unknown' : 'anonymous'))
  const [user, setUser] = useState<User | null>(null)

  const forget = () => {
    tokenRef.current = null
    clearSession()
    setUser(null)
    setStatus('anonymous')
  }

  setAccessTokenGetter(() => tokenRef.current)
  setUnauthorizedHandler(forget)

  useEffect(() => {
    if (!tokenRef.current) return

    let active = true
    authApi
      .me()
      .then((current) => {
        if (!active) return
        setUser(current)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!active) return
        forget()
      })

    return () => {
      active = false
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async login(email, password) {
        const session = await authApi.login(email, password)
        tokenRef.current = session.accessToken
        writeSession({ accessToken: session.accessToken, expiresAt: session.expiresAt })
        setUser(session.user)
        setStatus('authenticated')
      },
      async logout() {
        try {
          await authApi.logout()
        } catch {
          /* Local sign-out still stands if the token is already invalid. */
        }
        forget()
      },
    }),
    [status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
