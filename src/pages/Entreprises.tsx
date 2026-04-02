import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Building2, Search, Loader2, ChevronLeft, ChevronRight, ExternalLink, Users, FilterX } from 'lucide-react'
import { DigiIcon } from '@/components/icons/DigiIcon'
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
import { EntrepriseDrawer } from '@/components/entreprises/EntrepriseDrawer'
import type { Entreprise, Tier, StatutEntreprise } from '@/lib/types'

type EntrepriseWithParent = Entreprise & {
  parent: { id: string; company_name: string } | null
}

const PAGE_SIZE = 50

const TIER_COLORS: Record<string, string> = {
  'Tier 1': 'default',
  'Tier 2': 'secondary',
  'Tier 3': 'outline',
  'Hors-Tier': 'ghost',
}

const STATUT_COLORS: Record<string, string> = {
  'Qualifiée': 'default',
  'A démarcher': 'secondary',
  'En cours': 'outline',
  'Actuellement client': 'default',
  'Deal en cours': 'destructive',
}

function TierBadge({ tier }: { tier: Tier | null }) {
  if (!tier) return <span className="text-xs text-muted-foreground">—</span>
  return <Badge variant={(TIER_COLORS[tier] ?? 'outline') as 'default'}>{tier}</Badge>
}

function StatutBadge({ statut }: { statut: StatutEntreprise | null }) {
  if (!statut) return <span className="text-xs text-muted-foreground">—</span>
  return <Badge variant={(STATUT_COLORS[statut] ?? 'outline') as 'default'}>{statut}</Badge>
}

export default function Entreprises() {
  const [searchParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<string>(searchParams.get('tier') ?? 'all')
  const [statutFilter, setStatutFilter] = useState<string>(searchParams.get('statut') ?? 'all')
  const [secteurFilter, setSecteurFilter] = useState<string>(searchParams.get('secteur') ?? 'all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Entreprise | null>(null)

  const hasActiveFilters = tierFilter !== 'all' || statutFilter !== 'all' || secteurFilter !== 'all' || clientFilter !== 'all' || search.trim() !== ''
  const activeClass = 'border-primary bg-primary/10 text-primary'

  function clearAllFilters() {
    setTierFilter('all')
    setStatutFilter('all')
    setSecteurFilter('all')
    setClientFilter('all')
    setSearch('')
    setPage(0)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (query: any) => {
    let q = query
    if (tierFilter !== 'all') q = q.eq('tier', tierFilter)
    if (statutFilter !== 'all') q = q.eq('statut_entreprise', statutFilter)
    if (secteurFilter !== 'all') q = q.eq('secteur_digi', secteurFilter)
    if (clientFilter === 'oui') q = q.eq('is_digi_client', true)
    else if (clientFilter === 'non') q = q.eq('is_digi_client', false)
    if (search.trim()) q = q.ilike('company_name', `%${search.trim()}%`)
    return q
  }

  const { data: entreprises, loading, refetch } = useSupabaseQuery<EntrepriseWithParent[]>(
    () => applyFilters(
      supabase.from('entreprises').select('*, parent:parent_company_id(id, company_name)').order('company_name', { ascending: true })
    ).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
    [page, tierFilter, statutFilter, secteurFilter, clientFilter, search]
  )

  const { data: countResult } = useSupabaseQuery<{ count: number }[]>(
    async () => {
      const res = await applyFilters(
        supabase.from('entreprises').select('id', { count: 'exact', head: true })
      )
      return { data: [{ count: res.count ?? 0 }], error: res.error }
    },
    [tierFilter, statutFilter, secteurFilter, clientFilter, search]
  )

  const totalCount = countResult?.[0]?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasFilters = tierFilter !== 'all' || statutFilter !== 'all' || secteurFilter !== 'all' || clientFilter !== 'all' || search.trim() !== ''

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entreprises</h1>
        <p className="text-muted-foreground">
          {totalCount.toLocaleString('fr-FR')} entreprise{totalCount > 1 ? 's' : ''}{hasFilters ? ' (filtrées)' : ' en base'}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher une entreprise..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v as string); setPage(0) }}>
          <SelectTrigger className={tierFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{tierFilter === 'all' ? 'Tous les tiers' : tierFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les tiers</SelectItem>
            <SelectItem value="Tier 1">Tier 1</SelectItem>
            <SelectItem value="Tier 2">Tier 2</SelectItem>
            <SelectItem value="Tier 3">Tier 3</SelectItem>
            <SelectItem value="Hors-Tier">Hors-Tier</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statutFilter} onValueChange={(v) => { setStatutFilter(v as string); setPage(0) }}>
          <SelectTrigger className={statutFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{statutFilter === 'all' ? 'Tous les statuts' : statutFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="Qualifiée">Qualifiée</SelectItem>
            <SelectItem value="A démarcher">A démarcher</SelectItem>
            <SelectItem value="En cours">En cours</SelectItem>
            <SelectItem value="Actuellement client">Actuellement client</SelectItem>
            <SelectItem value="Deal en cours">Deal en cours</SelectItem>
          </SelectContent>
        </Select>

        <Select value={secteurFilter} onValueChange={(v) => { setSecteurFilter(v as string); setPage(0) }}>
          <SelectTrigger className={secteurFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{secteurFilter === 'all' ? 'Tous les secteurs' : secteurFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les secteurs</SelectItem>
            <SelectItem value="Tech">Tech</SelectItem>
            <SelectItem value="Service B2B">Service B2B</SelectItem>
            <SelectItem value="Education">Education</SelectItem>
            <SelectItem value="BAF">BAF</SelectItem>
            <SelectItem value="Tourisme/Loisir">Tourisme/Loisir</SelectItem>
            <SelectItem value="Service">Service</SelectItem>
            <SelectItem value="Pharma/Santé">Pharma/Santé</SelectItem>
            <SelectItem value="Grande distribution">Grande distribution</SelectItem>
            <SelectItem value="Immobilier">Immobilier</SelectItem>
            <SelectItem value="Recrutement">Recrutement</SelectItem>
            <SelectItem value="Transports/Logistique">Transports/Logistique</SelectItem>
            <SelectItem value="Luxe">Luxe</SelectItem>
            <SelectItem value="e-commerce">e-commerce</SelectItem>
          </SelectContent>
        </Select>

        <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v as string); setPage(0) }}>
          <SelectTrigger className={clientFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{clientFilter === 'all' ? 'Client Digi' : clientFilter === 'oui' ? 'Client Digi' : 'Non client'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="oui">Client Digi</SelectItem>
            <SelectItem value="non">Non client</SelectItem>
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
      ) : !entreprises || entreprises.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">Aucune entreprise trouvée</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Essayez de modifier vos filtres.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">Entreprise</TableHead>
                  <TableHead className="w-[16%]">Localisation</TableHead>
                  <TableHead className="w-[10%]">Taille</TableHead>
                  <TableHead className="w-[14%]">Secteur</TableHead>
                  <TableHead className="w-[8%]">Tier</TableHead>
                  <TableHead className="w-[10%]">Statut</TableHead>
                  <TableHead className="w-[6%]">ICP</TableHead>
                  <TableHead className="w-[8%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entreprises.map(e => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => setSelected(e)}>
                    <TableCell className="max-w-[250px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{e.company_name}</span>
                        {e.is_digi_client && (
                          <span title="Client Digi"><DigiIcon className="h-4 w-4 shrink-0" /></span>
                        )}
                        {e.company_id_linkedin && (
                          <a
                            href={`https://www.linkedin.com/company/${e.company_id_linkedin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {e.parent ? (
                        <p className="text-xs text-muted-foreground truncate">Filiale de {e.parent.company_name}</p>
                      ) : e.is_subsidiary ? (
                        <p className="text-xs text-amber-500">Filiale non rattachée</p>
                      ) : null}
                      {e.company_domain && (
                        <p className="text-xs text-muted-foreground">{e.company_domain}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                      {e.company_location ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.company_employee_range ?? (e.company_employee_count ? `${e.company_employee_count.toLocaleString('fr-FR')} emp.` : '—')}
                    </TableCell>
                    <TableCell>
                      {e.secteur_digi ? (
                        <Badge variant="outline">{e.secteur_digi}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {e.linkedin_industry && (
                        <p className="text-xs text-muted-foreground mt-0.5 max-w-[180px] truncate" title={e.linkedin_industry}>
                          {e.linkedin_industry}
                        </p>
                      )}
                    </TableCell>
                    <TableCell><TierBadge tier={e.tier} /></TableCell>
                    <TableCell><StatutBadge statut={e.statut_entreprise} /></TableCell>
                    <TableCell>
                      <Badge variant={e.icp ? 'default' : 'outline'}>
                        {e.icp ? 'Oui' : 'Non'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/contacts?entreprise=${e.id}&nom=${encodeURIComponent(e.company_name)}`}
                        onClick={(ev) => ev.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <Users className="h-3.5 w-3.5" />
                        Contacts
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
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

      <EntrepriseDrawer
        entreprise={selected}
        onClose={() => setSelected(null)}
        onSaved={() => { setSelected(null); refetch() }}
      />
    </div>
  )
}
