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
  contacts_contactes: number
  tier1: number
  tier2: number
  tier3: number
}

export function useDashboardStats() {
  return useSupabaseQuery<DashboardStats>(async () => {
    const { data, error } = await supabase.rpc('get_dashboard_stats').single()
    if (error || !data) return { data: null, error }
    const r = data as Record<keyof DashboardStats, number | string>
    const num = (v: number | string | null | undefined) => Number(v ?? 0)
    return {
      data: {
        total_entreprises: num(r.total_entreprises),
        total_contacts: num(r.total_contacts),
        total_notifications: num(r.total_notifications),
        deals_en_cours: num(r.deals_en_cours),
        contacts_a_contacter: num(r.contacts_a_contacter),
        contacts_contactes: num(r.contacts_contactes),
        tier1: num(r.tier1),
        tier2: num(r.tier2),
        tier3: num(r.tier3),
      },
      error: null,
    }
  })
}
