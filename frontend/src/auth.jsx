import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, clearToken } from './api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Returning from a REAL OAuth handshake: the backend bounced us back with
    // `#tk=<jwt>&oauth=1` in the URL fragment. Adopt the token + clean the URL.
    const hash = window.location.hash || ''
    if (hash.includes('tk=')) {
      try {
        const q = new URLSearchParams(hash.slice(1))
        const tk = q.get('tk')
        if (tk) {
          setToken(tk)
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      } catch { /* ignore bad fragments */ }
    }
    const t = getToken()
    if (t) {
      api
        .get('/auth/me')
        .then(setUser)
        .catch(() => clearToken())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login(email, password, role) {
    const data = await api.post('/auth/login', { email, password, role })
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }

  async function signup(payload) {
    const data = await api.post('/auth/signup', payload)
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }

  async function socialLogin(provider) {
    const data = await api.post('/auth/social', { provider })
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }

  function logout() {
    clearToken()
    setUser(null)
    // also clear the server-side auth cookie (ignore failures)
    api.post('/auth/logout').catch(() => {})
  }

  return (
    <AuthCtx.Provider
      value={{ user, setUser, loading, login, signup, socialLogin, logout }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
