import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type AppRole = 'admin' | 'account_manager' | 'membre'

interface Membre {
  id: string
  full_name: string
  role: AppRole
}

interface AuthState {
  membre: Membre | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [membre, setMembre] = useState<Membre | null>(null)
  const [loading, setLoading] = useState(true)

  async function resolveAccess(userId: string): Promise<Membre | null> {
    const { data } = await supabase
      .from('membres_digilityx')
      .select('id, full_name, role, partager_contacts')
      .eq('auth_user_id', userId)
      .single()

    if (!data || data.partager_contacts === false) return null
    const { partager_contacts: _, ...membreData } = data
    return membreData as Membre
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const m = await resolveAccess(session.user.id)
        if (!m) await supabase.auth.signOut()
        setMembre(m)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setMembre(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message

    const m = await resolveAccess(data.user.id)
    if (!m) {
      await supabase.auth.signOut()
      return "Votre compte n'est pas autorisé à accéder à DigiLeads."
    }

    setMembre(m)
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setMembre(null)
  }

  return (
    <AuthContext.Provider value={{ membre, loading, signIn, signOut }}>
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
