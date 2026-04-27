import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Users, Search, ChevronLeft, ChevronRight, X, Building2, FilterX, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSupabaseQuery } from '@/lib/hooks/use-supabase'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
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
import { useAuth, isAdmin } from '@/lib/auth'
import type { Hierarchie, Persona, NiveauRelation } from '@/lib/types'

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  company_name: string | null
  location: string | null
  linkedin_url: string | null
  id_url_linkedin: string | null
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
  const { membre } = useAuth()
  const userIsAdmin = isAdmin(membre?.role)
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
  const [tierFilter, setTierFilter] = useState<string>(!userIsAdmin ? 'Tier 1' : 'all')
  const [scoreAsc, setScoreAsc] = useState(false)
  const [selected, setSelected] = useState<ContactRow | null>(null)
  const [relationOverrides, setRelationOverrides] = useState<Record<string, string>>({})
  const [onlyMine, setOnlyMine] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 300)

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
      .select('id, first_name, last_name, position, company_name, location, linkedin_url, id_url_linkedin, email, persona, hierarchie, statut_contact, niveau_de_relation, scoring, nb_personnes_digi_relation, contact_digi, entreprise_id, owner_membre_id, entreprises(tier)')
      .eq('id', contactParam)
      .single()
      .then(({ data }) => {
        if (data) setSelected(data as ContactRow)
      })
  }, [contactParam])

  const restrictToMembreId = !userIsAdmin || onlyMine ? membre?.id ?? null : null
  const scoped = restrictToMembreId !== null

  const { data: contacts, loading, refetch } = useSupabaseQuery<ContactRow[]>(
    async () => {
      if (restrictToMembreId) {
        const { data, error } = await supabase.rpc('get_contacts_for_membre', {
          p_membre_id: restrictToMembreId,
          p_tier: tierFilter === 'all' ? null : tierFilter,
          p_statut: statutFilter === 'all' ? null : statutFilter,
          p_hierarchie: hierarchieFilter === 'all' ? null : hierarchieFilter,
          p_persona: personaFilter === 'all' ? null : personaFilter,
          p_entreprise_link: entrepriseLinkFilter === 'all' ? null : entrepriseLinkFilter,
          p_entreprise_id: entrepriseFilter ?? null,
          p_search: debouncedSearch.trim() || null,
          p_order_asc: scoreAsc,
          p_offset: page * PAGE_SIZE,
          p_limit: PAGE_SIZE,
        })
        return { data: (data ?? []) as ContactRow[], error }
      }

      const joinType = tierFilter !== 'all' ? 'entreprises!inner(tier)' : 'entreprises(tier)'
      let query = supabase
        .from('contacts')
        .select(`id, first_name, last_name, position, company_name, location, linkedin_url, id_url_linkedin, email, persona, hierarchie, statut_contact, niveau_de_relation, scoring, nb_personnes_digi_relation, contact_digi, entreprise_id, owner_membre_id, ${joinType}`)
        .order('scoring', { ascending: scoreAsc })

      if (entrepriseFilter) query = query.eq('entreprise_id', entrepriseFilter)
      if (statutFilter !== 'all') query = query.eq('statut_contact', statutFilter)
      if (hierarchieFilter !== 'all') query = query.eq('hierarchie', hierarchieFilter)
      if (personaFilter !== 'all') query = query.eq('persona', personaFilter)
      if (entrepriseLinkFilter === 'sans') query = query.is('company_name', null)
      else if (entrepriseLinkFilter === 'avec') query = query.not('company_name', 'is', null)
      else if (entrepriseLinkFilter === 'non-rattache') query = query.not('company_name', 'is', null).is('entreprise_id', null)
      if (tierFilter !== 'all') query = query.eq('entreprises.tier', tierFilter)
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim()
        query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,company_name.ilike.%${s}%`)
      }

      return query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    },
    [page, hierarchieFilter, personaFilter, statutFilter, entrepriseLinkFilter, tierFilter, scoreAsc, debouncedSearch, entrepriseFilter, restrictToMembreId]
  )

  const { data: countResult } = useSupabaseQuery<{ count: number }[]>(
    async () => {
      if (restrictToMembreId) {
        const { data, error } = await supabase.rpc('count_contacts_for_membre', {
          p_membre_id: restrictToMembreId,
          p_tier: tierFilter === 'all' ? null : tierFilter,
          p_statut: statutFilter === 'all' ? null : statutFilter,
          p_hierarchie: hierarchieFilter === 'all' ? null : hierarchieFilter,
          p_persona: personaFilter === 'all' ? null : personaFilter,
          p_entreprise_link: entrepriseLinkFilter === 'all' ? null : entrepriseLinkFilter,
          p_entreprise_id: entrepriseFilter ?? null,
          p_search: debouncedSearch.trim() || null,
        })
        return { data: [{ count: Number(data ?? 0) }], error }
      }

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
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim()
        query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,company_name.ilike.%${s}%`)
      }

      const res = await query
      return { data: [{ count: res.count ?? 0 }], error: res.error }
    },
    [hierarchieFilter, personaFilter, statutFilter, entrepriseLinkFilter, tierFilter, debouncedSearch, entrepriseFilter, restrictToMembreId]
  )

  const [entrepriseContactCounts, setEntrepriseContactCounts] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (!contacts || contacts.length === 0) return
    const entIds = [...new Set(contacts.map(c => c.entreprise_id).filter(Boolean))] as string[]
    if (entIds.length === 0) return

    supabase
      .rpc('contact_counts_for_entreprises', { ids: entIds })
      .then(({ data }) => {
        if (!data) return
        const map = new Map<string, number>()
        for (const row of data as { entreprise_id: string; cnt: number }[]) {
          map.set(row.entreprise_id, Number(row.cnt))
        }
        setEntrepriseContactCounts(map)
      })
  }, [contacts])

  const totalCount = countResult?.[0]?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">
          {countResult ? (
            <>{totalCount.toLocaleString('fr-FR')} {restrictToMembreId ? 'contacts liés à vous' : 'contacts qualifiés avec scoring'}.</>
          ) : (
            <span className="inline-block h-4 w-48 animate-pulse rounded bg-muted" />
          )}
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
            <SelectItem value="Client">Client</SelectItem>
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

        {userIsAdmin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setOnlyMine(v => !v); setPage(0) }}
            className={onlyMine ? activeClass : ''}
            title={onlyMine ? 'Voir tous les contacts' : 'Voir uniquement mes contacts'}
          >
            <Users className="h-4 w-4" />
            Mes contacts
          </Button>
        )}

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
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Statut</TableHead>
                {scoped && <TableHead>Relation</TableHead>}
                <TableHead className="text-center">Digi</TableHead>
                <TableHead className="text-center">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: scoped ? 6 : 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
                  <TableHead>Statut</TableHead>
                  {scoped && <TableHead>Relation</TableHead>}
                  <TableHead className="text-center">Digi</TableHead>
                  <TableHead className="text-center">
                    <button
                      type="button"
                      onClick={() => { setScoreAsc(v => !v); setPage(0) }}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Score
                      {scoreAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => {
                  const companyCount = c.entreprise_id ? (entrepriseContactCounts.get(c.entreprise_id) ?? 0) : 0;
                  return (
                    <TableRow key={c.id} className={userIsAdmin ? 'cursor-pointer' : ''} onClick={() => userIsAdmin && setSelected(c)}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm">
                            {c.first_name} {c.last_name}
                          </p>
                          {(c.id_url_linkedin || c.linkedin_url) && (
                            <a
                              href={c.id_url_linkedin ? `https://www.linkedin.com/in/${c.id_url_linkedin}/` : c.linkedin_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(ev) => ev.stopPropagation()}
                              title="Voir le profil LinkedIn"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
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
                        {c.statut_contact ? (
                          <Badge variant="secondary">{c.statut_contact}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {scoped && (() => {
                      const currentRelation = relationOverrides[c.id] ?? c.niveau_de_relation ?? 'Non renseigné'
                      const isMissing = !currentRelation || currentRelation === 'Non renseigné'
                      return (
                      <TableCell>
                        <select
                          value={currentRelation}
                          onClick={e => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation()
                            const newVal = e.target.value
                            setRelationOverrides(prev => ({ ...prev, [c.id]: newVal }))
                            supabase
                              .from('contacts')
                              .update({ niveau_de_relation: newVal })
                              .eq('id', c.id)
                              .then(({ error }) => {
                                if (error) {
                                  setRelationOverrides(prev => {
                                    const next = { ...prev }
                                    delete next[c.id]
                                    return next
                                  })
                                  console.error('niveau_de_relation update failed', error)
                                }
                              })
                          }}
                          className={`h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 ${
                            isMissing ? 'text-destructive border-destructive/50' : ''
                          }`}
                        >
                          <option value="Non renseigné">Non renseigné</option>
                          <option value="Ami">Ami</option>
                          <option value="Cercle familial">Cercle familial</option>
                          <option value="Ancien collègue">Ancien collègue</option>
                          <option value="Alumni">Alumni</option>
                          <option value="Partenaire business">Partenaire business</option>
                          <option value="Connaissance">Connaissance</option>
                          <option value="Inconnu">Inconnu</option>
                        </select>
                      </TableCell>
                      )
                      })()}
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
        isAdmin={userIsAdmin}
      />
    </div>
  )
}
