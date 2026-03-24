import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useSupabaseQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  deps: unknown[] = []
) {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  const refetch = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }))
    queryFn().then(({ data, error }) => {
      if (error) {
        setState({ data: null, loading: false, error: error.message })
      } else {
        setState({ data, loading: false, error: null })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    refetch()
  }, [refetch])

  return { ...state, refetch }
}

export interface DashboardStats {
  total_entreprises: number
  total_contacts: number
  total_notifications: number
  deals_en_cours: number
  contacts_a_contacter: number
  contacts_a_surveiller: number
  tier1: number
  tier2: number
  tier3: number
}

export function useDashboardStats() {
  return useSupabaseQuery<DashboardStats>(async () => {
    const [entreprises, contacts, notifications] = await Promise.all([
      supabase.from('entreprises').select('id, tier, statut_entreprise', { count: 'exact', head: true }),
      supabase.from('contacts').select('id, statut_contact', { count: 'exact', head: true }),
      supabase.from('notifications').select('id', { count: 'exact', head: true }),
    ])

    const [dealsRes, tier1Res, tier2Res, tier3Res, aContacterRes, aSurveillerRes] = await Promise.all([
      supabase.from('entreprises').select('id', { count: 'exact', head: true }).eq('statut_entreprise', 'Deal en cours'),
      supabase.from('entreprises').select('id', { count: 'exact', head: true }).eq('tier', 'Tier 1'),
      supabase.from('entreprises').select('id', { count: 'exact', head: true }).eq('tier', 'Tier 2'),
      supabase.from('entreprises').select('id', { count: 'exact', head: true }).eq('tier', 'Tier 3'),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('statut_contact', 'A contacter'),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('statut_contact', 'A surveiller'),
    ])

    return {
      data: {
        total_entreprises: entreprises.count ?? 0,
        total_contacts: contacts.count ?? 0,
        total_notifications: notifications.count ?? 0,
        deals_en_cours: dealsRes.count ?? 0,
        contacts_a_contacter: aContacterRes.count ?? 0,
        contacts_a_surveiller: aSurveillerRes.count ?? 0,
        tier1: tier1Res.count ?? 0,
        tier2: tier2Res.count ?? 0,
        tier3: tier3Res.count ?? 0,
      },
      error: entreprises.error || contacts.error || notifications.error || null,
    }
  })
}
