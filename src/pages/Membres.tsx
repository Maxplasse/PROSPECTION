import { useState, useEffect } from 'react'
import { Loader2, Users, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'

interface MembreStats {
  id: string
  full_name: string
  total: number
  byStatut: Record<string, number>
}

const STATUTS_ENTREPRISE = [
  'Qualifiée', 'A démarcher', 'En cours', 'Actuellement client', 'Deal en cours',
]

const STATUTS_CONTACT = [
  'À contacter', 'Contacté', 'Intéressé', 'Pas intéressé', 'En attente', 'Déjà client',
]

type Tab = 'owner' | 'account_manager'

export default function Membres() {
  const [tab, setTab] = useState<Tab>('owner')
  const [membresCount, setMembresCount] = useState(0)
  const [ownerStats, setOwnerStats] = useState<MembreStats[]>([])
  const [amStats, setAmStats] = useState<MembreStats[]>([])
  const [loadingOwner, setLoadingOwner] = useState(true)
  const [loadingAM, setLoadingAM] = useState(true)

  useEffect(() => {
    loadOwnerStats()
    loadAMStats()
  }, [])

  async function loadOwnerStats() {
    setLoadingOwner(true)

    // Fetch membres
    const { data: membresData } = await supabase
      .from('membres_digilityx')
      .select('id, full_name')
      .order('full_name')
    const allMembres = membresData ?? []
    setMembresCount(allMembres.length)

    // Fetch ALL contacts with owner + statut (paginated to avoid 1000 limit)
    const allContacts: { owner_membre_id: string | null; statut_contact: string | null }[] = []
    let offset = 0
    const PAGE = 1000
    while (true) {
      const { data } = await supabase
        .from('contacts')
        .select('owner_membre_id, statut_contact')
        .not('owner_membre_id', 'is', null)
        .range(offset, offset + PAGE - 1)
      if (!data || data.length === 0) break
      allContacts.push(...data)
      if (data.length < PAGE) break
      offset += PAGE
    }

    // Aggregate
    const stats: MembreStats[] = allMembres.map(m => {
      const mine = allContacts.filter(c => c.owner_membre_id === m.id)
      const byStatut: Record<string, number> = {}
      for (const s of STATUTS_CONTACT) {
        byStatut[s] = mine.filter(c => c.statut_contact === s).length
      }
      return { ...m, total: mine.length, byStatut }
    })

    setOwnerStats(stats.sort((a, b) => b.total - a.total))
    setLoadingOwner(false)
  }

  async function loadAMStats() {
    setLoadingAM(true)

    const { data: membresData } = await supabase
      .from('membres_digilityx')
      .select('id, full_name')
      .order('full_name')
    const allMembres = membresData ?? []

    // Fetch ALL entreprises with AM + statut (paginated)
    const allEntreprises: { account_manager_id: string | null; statut_entreprise: string | null }[] = []
    let offset = 0
    const PAGE = 1000
    while (true) {
      const { data } = await supabase
        .from('entreprises')
        .select('account_manager_id, statut_entreprise')
        .not('account_manager_id', 'is', null)
        .range(offset, offset + PAGE - 1)
      if (!data || data.length === 0) break
      allEntreprises.push(...data)
      if (data.length < PAGE) break
      offset += PAGE
    }

    const stats: MembreStats[] = allMembres.map(m => {
      const mine = allEntreprises.filter(e => e.account_manager_id === m.id)
      const byStatut: Record<string, number> = {}
      for (const s of STATUTS_ENTREPRISE) {
        byStatut[s] = mine.filter(e => e.statut_entreprise === s).length
      }
      return { ...m, total: mine.length, byStatut }
    })

    setAmStats(stats.sort((a, b) => b.total - a.total))
    setLoadingAM(false)
  }

  const isLoading = tab === 'owner' ? loadingOwner : loadingAM
  const stats = tab === 'owner' ? ownerStats : amStats
  const statuts = tab === 'owner' ? STATUTS_CONTACT : STATUTS_ENTREPRISE
  const label = tab === 'owner' ? 'contacts' : 'entreprises'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membres Digi</h1>
        <p className="text-muted-foreground">
          {membresCount} membres · {tab === 'owner' ? 'Contacts par owner' : 'Entreprises par AM'}.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('owner')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'owner'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-4 w-4" />
          Vue Owner
        </button>
        <button
          onClick={() => setTab('account_manager')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'account_manager'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="h-4 w-4" />
          Vue Account Manager
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead className="text-center">Total {label}</TableHead>
                {statuts.map(s => (
                  <TableHead key={s} className="text-center text-xs">{s}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.filter(m => m.total > 0).map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium whitespace-nowrap">{m.full_name}</TableCell>
                  <TableCell className="text-center">
                    <span className="font-bold">{m.total}</span>
                  </TableCell>
                  {statuts.map(s => (
                    <TableCell key={s} className="text-center">
                      {m.byStatut[s] > 0 ? (
                        <span className="text-sm font-medium">{m.byStatut[s]}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {stats.filter(m => m.total === 0).length > 0 && (
                <TableRow>
                  <TableCell colSpan={statuts.length + 2} className="text-center text-sm text-muted-foreground py-3">
                    {stats.filter(m => m.total === 0).length} membres sans {label}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
