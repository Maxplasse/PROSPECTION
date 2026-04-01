import { useState, useEffect } from 'react'
import { Loader2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSupabaseQuery } from '@/lib/hooks/use-supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import type { NiveauRelation } from '@/lib/types'

interface MembreRow {
  id: string
  full_name: string
  consent: boolean
}

interface EntrepriseAssignment {
  account_manager_id: string | null
  statut_entreprise: string | null
}

interface ContactAssignment {
  owner_membre_id: string | null
  statut_contact: string | null
}

interface RelationContact {
  id: string
  niveau_de_relation: string | null
  contacts: {
    id: string
    first_name: string | null
    last_name: string | null
    position: string | null
    company_name: string | null
  } | null
}

const STATUTS_ENTREPRISE = [
  'Qualifiée', 'A démarcher', 'En cours', 'Actuellement client', 'Deal en cours',
] as const

const STATUTS_CONTACT = [
  'À contacter', 'Contacté', 'Intéressé', 'Pas intéressé', 'En attente', 'Déjà client',
] as const

const NIVEAUX_RELATION: NiveauRelation[] = [
  'Ami', 'Cercle familial', 'Ancien collègue', 'Alumni',
  'Partenaire business', 'Connaissance', 'Inconnu',
]

type ViewMode = 'owner' | 'account_manager' | 'relations'

export default function Membres() {
  const [view, setView] = useState<ViewMode>('owner')

  const { data: membres, loading: loadingMembres, refetch: refetchMembres } = useSupabaseQuery<MembreRow[]>(
    () => supabase.from('membres_digilityx').select('id, full_name, consent').order('full_name')
  )

  const { data: entreprises, loading: loadingEntreprises } = useSupabaseQuery<EntrepriseAssignment[]>(
    () => supabase.from('entreprises').select('account_manager_id, statut_entreprise')
  )

  const { data: contacts, loading: loadingContacts } = useSupabaseQuery<ContactAssignment[]>(
    () => supabase.from('contacts').select('owner_membre_id, statut_contact')
  )

  const loading = loadingMembres || loadingEntreprises || loadingContacts

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const allMembres = membres ?? []
  const allEntreprises = entreprises ?? []
  const allContacts = contacts ?? []

  if (view === 'relations') {
    return (
      <PageShell count={allMembres.length} view={view} setView={setView}>
        <RelationsView membres={allMembres} onConsentChanged={refetchMembres} />
      </PageShell>
    )
  }

  if (view === 'account_manager') {
    const statuts = STATUTS_ENTREPRISE
    const rows = allMembres
      .map(m => {
        const mine = allEntreprises.filter(e => e.account_manager_id === m.id)
        const byStatut = Object.fromEntries(
          statuts.map(s => [s, mine.filter(e => e.statut_entreprise === s).length])
        )
        return { ...m, total: mine.length, byStatut }
      })
      .sort((a, b) => b.total - a.total)

    return (
      <PageShell count={allMembres.length} view={view} setView={setView}>
        <MembresTable
          rows={rows}
          statuts={[...statuts]}
          label="entreprises"
        />
      </PageShell>
    )
  }

  // Owner view — based on contacts
  const statuts = STATUTS_CONTACT
  const rows = allMembres
    .map(m => {
      const mine = allContacts.filter(c => c.owner_membre_id === m.id)
      const byStatut = Object.fromEntries(
        statuts.map(s => [s, mine.filter(c => c.statut_contact === s).length])
      )
      return { ...m, total: mine.length, byStatut }
    })
    .sort((a, b) => b.total - a.total)

  return (
    <PageShell count={allMembres.length} view={view} setView={setView}>
      <MembresTable
        rows={rows}
        statuts={[...statuts]}
        label="contacts"
      />
    </PageShell>
  )
}

function PageShell({ count, view, setView, children }: {
  count: number
  view: ViewMode
  setView: (v: ViewMode) => void
  children: React.ReactNode
}) {
  const viewLabel = view === 'owner' ? 'Contacts par owner'
    : view === 'account_manager' ? 'Entreprises par AM'
    : 'Mes relations'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membres Digi</h1>
        <p className="text-muted-foreground">
          {count} membres · {viewLabel}.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <SelectTrigger>
            <SelectValue>
              {view === 'owner' ? 'Vue Owner (contacts)' : view === 'account_manager' ? 'Vue Account Manager (entreprises)' : 'Vue Mes relations'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Vue Owner (contacts)</SelectItem>
            <SelectItem value="account_manager">Vue Account Manager (entreprises)</SelectItem>
            <SelectItem value="relations">Vue Mes relations</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {children}
    </div>
  )
}

function MembresTable({ rows, statuts, label }: {
  rows: { id: string; full_name: string; total: number; byStatut: Record<string, number> }[]
  statuts: string[]
  label: string
}) {
  return (
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
          {rows.map(m => (
            <TableRow key={m.id}>
              <TableCell className="font-medium whitespace-nowrap">{m.full_name}</TableCell>
              <TableCell className="text-center">
                {m.total > 0 ? (
                  <span className="font-bold">{m.total}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
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
        </TableBody>
      </Table>
    </div>
  )
}

function RelationsView({ membres, onConsentChanged }: {
  membres: MembreRow[]
  onConsentChanged: () => void
}) {
  const [selectedMembre, setSelectedMembre] = useState<string>(membres[0]?.id ?? '')
  const [relations, setRelations] = useState<RelationContact[]>([])
  const [loading, setLoading] = useState(false)
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [togglingConsent, setTogglingConsent] = useState(false)

  const currentMembre = membres.find(m => m.id === selectedMembre)

  useEffect(() => {
    if (!selectedMembre) return
    setLoading(true)
    setChanges({})
    supabase
      .from('contacts_membres_relations')
      .select('id, niveau_de_relation, contacts(id, first_name, last_name, position, company_name)')
      .eq('membre_id', selectedMembre)
      .order('niveau_de_relation')
      .then(({ data }) => {
        setRelations((data ?? []) as unknown as RelationContact[])
        setLoading(false)
      })
  }, [selectedMembre])

  async function handleToggleConsent() {
    if (!currentMembre) return
    setTogglingConsent(true)
    await supabase
      .from('membres_digilityx')
      .update({ consent: !currentMembre.consent })
      .eq('id', currentMembre.id)
    setTogglingConsent(false)
    onConsentChanged()
  }

  async function handleSaveRelations() {
    setSaving(true)
    const promises = Object.entries(changes).map(([relationId, niveau]) =>
      supabase
        .from('contacts_membres_relations')
        .update({ niveau_de_relation: niveau })
        .eq('id', relationId)
    )
    await Promise.all(promises)
    setChanges({})
    setSaving(false)
    // Refresh
    const { data } = await supabase
      .from('contacts_membres_relations')
      .select('id, niveau_de_relation, contacts(id, first_name, last_name, position, company_name)')
      .eq('membre_id', selectedMembre)
      .order('niveau_de_relation')
    setRelations((data ?? []) as unknown as RelationContact[])
  }

  const hasChanges = Object.keys(changes).length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedMembre} onValueChange={(v) => { if (v) setSelectedMembre(v) }}>
          <SelectTrigger className="w-[240px]">
            <SelectValue>{currentMembre?.full_name ?? 'Sélectionner un membre'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {membres.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {currentMembre && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={currentMembre.consent}
                onChange={handleToggleConsent}
                disabled={togglingConsent}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm">Consentement</span>
            </label>
            {currentMembre.consent ? (
              <Badge variant="default">Actif</Badge>
            ) : (
              <Badge variant="outline">Inactif</Badge>
            )}
          </div>
        )}

        {hasChanges && (
          <Button size="sm" onClick={handleSaveRelations} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Enregistrer
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : relations.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Aucune relation trouvée pour ce membre.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Poste</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Niveau de relation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relations.map(r => {
                const contact = r.contacts
                if (!contact) return null
                const currentLevel = changes[r.id] ?? r.niveau_de_relation ?? 'Inconnu'
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {contact.first_name} {contact.last_name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {contact.position ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[160px]">
                      {contact.company_name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <select
                        value={currentLevel}
                        onChange={e => setChanges(prev => ({ ...prev, [r.id]: e.target.value }))}
                        className="h-7 w-full max-w-[180px] rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {NIVEAUX_RELATION.map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
