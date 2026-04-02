import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Users, Search, Loader2, ChevronLeft, ChevronRight, X, Building2, FilterX } from 'lucide-react'
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
import { ContactDrawer } from '@/components/contacts/ContactDrawer'
import { scoreContact } from '@/lib/scoring/score-contact'
import type { Hierarchie, Persona, NiveauRelation } from '@/lib/types'

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  company_name: string | null
  location: string | null
  linkedin_url: string | null
  email: string | null
  persona: string | null
  hierarchie: string | null
  statut_contact: string | null
  niveau_de_relation: string | null
  scoring: number
  nb_personnes_digi_relation: number
  contact_digi: boolean
  entreprise_id: string | null
  owner_membre_id: string | null
  entreprises: { tier: string | null } | { tier: string | null }[] | null
}

const PAGE_SIZE = 50

const HIERARCHIE_COLORS: Record<string, string> = {
  'COMEX': 'default',
  'Directeur': 'secondary',
  'Manager': 'outline',
  'Opérationnel': 'ghost',
}

function ScoreBar({ score }: { score: number }) {
  if (score === 0) return <span className="text-xs text-muted-foreground">—</span>

  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium">{score}</span>
    </div>
  )
}

function liveScore(c: ContactRow): number {
  return scoreContact({
    hierarchie: (c.hierarchie as Hierarchie) ?? null,
    persona: (c.persona as Persona) ?? null,
    niveauRelation: (c.niveau_de_relation as NiveauRelation) ?? null,
    nbPersonnesDigiRelation: c.nb_personnes_digi_relation,
  }).total
}

function RelationCount({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs text-muted-foreground">—</span>
  const color = count >= 3 ? 'default' : count >= 2 ? 'secondary' : 'outline'
  return <Badge variant={color as 'default'}>{count}</Badge>
}

export default function Contacts() {
  const [searchParams, setSearchParams] = useSearchParams()
  const entrepriseFilter = searchParams.get('entreprise')
  const entrepriseNameParam = searchParams.get('nom')
  const statutParam = searchParams.get('statut')
  const contactParam = searchParams.get('contact')

  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [hierarchieFilter, setHierarchieFilter] = useState<string>('all')
  const [personaFilter, setPersonaFilter] = useState<string>('all')
  const [statutFilter, setStatutFilter] = useState<string>(statutParam ?? 'all')
  const [entrepriseLinkFilter, setEntrepriseLinkFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('relations')
  const [selected, setSelected] = useState<ContactRow | null>(null)

  const hasActiveFilters = hierarchieFilter !== 'all' || personaFilter !== 'all' || statutFilter !== 'all' || entrepriseLinkFilter !== 'all' || tierFilter !== 'all' || search.trim() !== ''

  function clearAllFilters() {
    setHierarchieFilter('all')
    setPersonaFilter('all')
    setStatutFilter('all')
    setEntrepriseLinkFilter('all')
    setTierFilter('all')
    setSearch('')
    setPage(0)
  }

  const activeClass = 'border-primary bg-primary/10 text-primary'

  // Auto-open contact drawer from query param
  useEffect(() => {
    if (!contactParam) return
    supabase
      .from('contacts')
      .select('id, first_name, last_name, position, company_name, location, linkedin_url, email, persona, hierarchie, statut_contact, niveau_de_relation, scoring, nb_personnes_digi_relation, contact_digi, entreprise_id, owner_membre_id, entreprises(tier)')
      .eq('id', contactParam)
      .single()
      .then(({ data }) => {
        if (data) setSelected(data as ContactRow)
      })
  }, [contactParam])

  const orderColumn = sortBy === 'relations' ? 'nb_personnes_digi_relation'
    : sortBy === 'scoring' ? 'scoring'
    : 'created_at'

  const { data: contacts, loading, refetch } = useSupabaseQuery<ContactRow[]>(
    () => {
      // Use !inner join when filtering by tier to exclude contacts without matching entreprise
      const joinType = tierFilter !== 'all' ? 'entreprises!inner(tier)' : 'entreprises(tier)'
      let query = supabase
        .from('contacts')
        .select(`id, first_name, last_name, position, company_name, location, linkedin_url, email, persona, hierarchie, statut_contact, niveau_de_relation, scoring, nb_personnes_digi_relation, contact_digi, entreprise_id, owner_membre_id, ${joinType}`)
        .order(orderColumn, { ascending: false })

      if (entrepriseFilter) query = query.eq('entreprise_id', entrepriseFilter)
      if (statutFilter !== 'all') query = query.eq('statut_contact', statutFilter)
      if (hierarchieFilter !== 'all') query = query.eq('hierarchie', hierarchieFilter)
      if (personaFilter !== 'all') query = query.eq('persona', personaFilter)
      if (entrepriseLinkFilter === 'sans') query = query.is('company_name', null)
      else if (entrepriseLinkFilter === 'avec') query = query.not('company_name', 'is', null)
      else if (entrepriseLinkFilter === 'non-rattache') query = query.not('company_name', 'is', null).is('entreprise_id', null)
      if (tierFilter !== 'all') query = query.eq('entreprises.tier', tierFilter)
      if (search.trim()) {
        query = query.or(`first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%,company_name.ilike.%${search.trim()}%`)
      }

      return query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    },
    [page, hierarchieFilter, personaFilter, statutFilter, entrepriseLinkFilter, tierFilter, search, sortBy, entrepriseFilter]
  )

  const { data: countResult } = useSupabaseQuery<{ count: number }[]>(
    async () => {
      const joinType = tierFilter !== 'all' ? 'entreprises!inner(tier)' : 'entreprises(tier)'
      let query = supabase
        .from('contacts')
        .select(`id, ${joinType}`, { count: 'exact', head: true })

      if (entrepriseFilter) query = query.eq('entreprise_id', entrepriseFilter)
      if (statutFilter !== 'all') query = query.eq('statut_contact', statutFilter)
      if (hierarchieFilter !== 'all') query = query.eq('hierarchie', hierarchieFilter)
      if (personaFilter !== 'all') query = query.eq('persona', personaFilter)
      if (entrepriseLinkFilter === 'sans') query = query.is('company_name', null)
      else if (entrepriseLinkFilter === 'avec') query = query.not('company_name', 'is', null)
      else if (entrepriseLinkFilter === 'non-rattache') query = query.not('company_name', 'is', null).is('entreprise_id', null)
      if (tierFilter !== 'all') query = query.eq('entreprises.tier', tierFilter)
      if (search.trim()) {
        query = query.or(`first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%,company_name.ilike.%${search.trim()}%`)
      }

      const res = await query
      return { data: [{ count: res.count ?? 0 }], error: res.error }
    },
    [hierarchieFilter, personaFilter, statutFilter, entrepriseLinkFilter, tierFilter, search, entrepriseFilter]
  )

  // Fetch real contact counts per entreprise from DB
  const [entrepriseContactCounts, setEntrepriseContactCounts] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (!contacts || contacts.length === 0) return
    const entIds = [...new Set(contacts.map(c => c.entreprise_id).filter(Boolean))] as string[]
    if (entIds.length === 0) return

    supabase
      .from('contacts')
      .select('entreprise_id')
      .in('entreprise_id', entIds)
      .then(({ data }) => {
        const counts = new Map<string, number>()
        data?.forEach(c => {
          if (c.entreprise_id) counts.set(c.entreprise_id, (counts.get(c.entreprise_id) ?? 0) + 1)
        })
        setEntrepriseContactCounts(counts)
      })
  }, [contacts])

  const totalCount = countResult?.[0]?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">
          {totalCount.toLocaleString('fr-FR')} contacts qualifiés avec scoring.
        </p>
      </div>

      {entrepriseFilter && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-sm">
            Filtre entreprise : <strong>{entrepriseNameParam ?? entrepriseFilter}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setSearchParams({})}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher nom, entreprise..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <Select value={hierarchieFilter} onValueChange={(v) => { setHierarchieFilter(v as string); setPage(0) }}>
          <SelectTrigger className={hierarchieFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{hierarchieFilter === 'all' ? 'Toute hiérarchie' : hierarchieFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute hiérarchie</SelectItem>
            <SelectItem value="COMEX">COMEX</SelectItem>
            <SelectItem value="Directeur">Directeur</SelectItem>
            <SelectItem value="Manager">Manager</SelectItem>
            <SelectItem value="Opérationnel">Opérationnel</SelectItem>
          </SelectContent>
        </Select>

        <Select value={personaFilter} onValueChange={(v) => { setPersonaFilter(v as string); setPage(0) }}>
          <SelectTrigger className={personaFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{personaFilter === 'all' ? 'Toute persona' : personaFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute persona</SelectItem>
            <SelectItem value="Dirigeant">Dirigeant</SelectItem>
            <SelectItem value="Marketing">Marketing</SelectItem>
            <SelectItem value="Produit">Produit</SelectItem>
            <SelectItem value="Design">Design</SelectItem>
            <SelectItem value="Hors expertise Digi">Hors expertise</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statutFilter} onValueChange={(v) => { setStatutFilter(v as string); setPage(0) }}>
          <SelectTrigger className={statutFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{statutFilter === 'all' ? 'Tout statut' : statutFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tout statut</SelectItem>
            <SelectItem value="À contacter">À contacter</SelectItem>
            <SelectItem value="Contacté">Contacté</SelectItem>
            <SelectItem value="Intéressé">Intéressé</SelectItem>
            <SelectItem value="Pas intéressé">Pas intéressé</SelectItem>
            <SelectItem value="En attente">En attente</SelectItem>
            <SelectItem value="Déjà client">Déjà client</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v as string); setPage(0) }}>
          <SelectTrigger className={tierFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{tierFilter === 'all' ? 'Tout tier' : tierFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tout tier</SelectItem>
            <SelectItem value="Tier 1">Tier 1</SelectItem>
            <SelectItem value="Tier 2">Tier 2</SelectItem>
            <SelectItem value="Tier 3">Tier 3</SelectItem>
            <SelectItem value="Hors-Tier">Hors-Tier</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entrepriseLinkFilter} onValueChange={(v) => { setEntrepriseLinkFilter(v as string); setPage(0) }}>
          <SelectTrigger className={entrepriseLinkFilter !== 'all' ? activeClass : ''}>
            <SelectValue>
              {entrepriseLinkFilter === 'all' ? 'Toute entreprise'
                : entrepriseLinkFilter === 'sans' ? 'Sans entreprise'
                : entrepriseLinkFilter === 'non-rattache' ? 'Non rattachée'
                : 'Avec entreprise'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute entreprise</SelectItem>
            <SelectItem value="sans">Sans entreprise</SelectItem>
            <SelectItem value="non-rattache">Non rattachée</SelectItem>
            <SelectItem value="avec">Avec entreprise</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => { setSortBy(v as string); setPage(0) }}>
          <SelectTrigger>
            <SelectValue>
              {sortBy === 'relations' ? 'Relations Digi' : sortBy === 'scoring' ? 'Scoring' : 'Plus récent'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relations">Relations Digi</SelectItem>
            <SelectItem value="scoring">Scoring</SelectItem>
            <SelectItem value="recent">Plus récent</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            <FilterX className="h-4 w-4 mr-1.5" />
            Effacer
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !contacts || contacts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">Aucun contact trouvé</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Essayez de modifier vos filtres.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Qualification</TableHead>
                  <TableHead className="text-center">Digi</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => {
                  const companyCount = c.entreprise_id ? (entrepriseContactCounts.get(c.entreprise_id) ?? 0) : 0;
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                      <TableCell>
                        <p className="font-medium text-sm">
                          {c.first_name} {c.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {c.position ?? '—'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm truncate max-w-[140px]">{c.company_name ?? '—'}</p>
                          {c.entreprise_id && companyCount > 0 && (
                            <Link
                              to={`/contacts?entreprise=${c.entreprise_id}&nom=${encodeURIComponent(c.company_name ?? '')}`}
                              onClick={e => e.stopPropagation()}
                              title={`${companyCount} contact${companyCount > 1 ? 's' : ''} dans cette entreprise — cliquer pour voir`}
                            >
                              <Badge variant={companyCount >= 3 ? 'default' : 'outline'} className="text-[10px] px-1.5 py-0 gap-0.5">
                                <Building2 className="h-2.5 w-2.5" />
                                {companyCount}
                              </Badge>
                            </Link>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {c.hierarchie ? (
                            <Badge variant={(HIERARCHIE_COLORS[c.hierarchie] ?? 'outline') as 'default'}>
                              {c.hierarchie}
                            </Badge>
                          ) : null}
                          {c.persona && c.persona !== 'Hors expertise Digi' ? (
                            <Badge variant="outline">{c.persona}</Badge>
                          ) : null}
                          {c.statut_contact ? (
                            <Badge variant="secondary">{c.statut_contact}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <RelationCount count={c.nb_personnes_digi_relation} />
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreBar score={liveScore(c)} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} / {totalPages || 1} · {totalCount.toLocaleString('fr-FR')} résultats
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <ContactDrawer
        contact={selected}
        onClose={() => setSelected(null)}
        onSaved={() => { setSelected(null); refetch() }}
      />
    </div>
  )
}
