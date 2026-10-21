import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../services/supabase'

interface AuthValue { user: User | null; loading: boolean; refresh: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = async () => {
    if (!supabase) { setUser(null); setLoading(false); return }
    const { data } = await supabase.auth.getUser()
    setUser(data.user)
    setLoading(false)
  }
  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setLoading(false); return }
    void refresh()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])
  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return value
}
