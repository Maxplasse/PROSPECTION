import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AppRole = 'admin' | 'account_manager' | 'membre'

interface Membre {
  id: string
  full_name: string
  role: AppRole
}

interface AuthState {
  user: User | null
  session: Session | null
  membre: Membre | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [membre, setMembre] = useState<Membre | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchMembre(userId: string) {
    const { data } = await supabase
      .from('membres_digilityx')
      .select('id, full_name, role')
      .eq('auth_user_id', userId)
      .single()
    setMembre(data as Membre | null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        fetchMembre(s.user.id).then(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        fetchMembre(s.user.id)
      } else {
        setMembre(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setMembre(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, membre, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function isAdmin(role: AppRole | undefined): boolean {
  return role === 'admin'
}
