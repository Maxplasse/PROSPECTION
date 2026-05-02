import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Building2, Search, Loader2, ChevronLeft, ChevronRight, ExternalLink, Users, FilterX, Download, ChevronDown, Check } from 'lucide-react'
import * as XLSX from 'xlsx'
import { DigiIcon } from '@/components/icons/DigiIcon'
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
import { EntrepriseDrawer } from '@/components/entreprises/EntrepriseDrawer'
import { useAuth, isAdmin } from '@/lib/auth'
import type { Entreprise, Tier, StatutEntreprise } from '@/lib/types'

type EntrepriseWithParent = Entreprise & {
  parent: { id: string; company_name: string } | null
  account_manager: { id: string; full_name: string } | null
}

const PAGE_SIZE = 50

const TIER_COLORS: Record<string, string> = {
  'Tier 1': 'default',
  'Tier 2': 'secondary',
  'Tier 3': 'outline',
  'Hors-Tier': 'ghost',
}

const STATUT_COLORS: Record<string, string> = {
  'À démarcher': 'secondary',
  'Activement démarché': 'outline',
  'Deal en cours': 'destructive',
  'Devenu client Digileads': 'default',
}

function TierBadge({ tier }: { tier: Tier | null }) {
  if (!tier) return <span className="text-xs text-muted-foreground">—</span>
  return <Badge variant={(TIER_COLORS[tier] ?? 'outline') as 'default'}>{tier}</Badge>
}

function StatutBadge({ statut }: { statut: StatutEntreprise | null }) {
  if (!statut) return <span className="text-xs text-muted-foreground">—</span>
  return <Badge variant={(STATUT_COLORS[statut] ?? 'outline') as 'default'}>{statut}</Badge>
}

const SECTEURS = [
  'Pharma/Santé', 'BAF', 'Éducation & Formation', 'Tourisme, Hôtellerie & Loisirs',
  'Technologie & IT', 'Prestations aux entreprises', 'Media & Communication', 'Recrutement',
  'Commerce de Détail', 'Luxe', 'Services aux Consommateurs', 'Industrie & Énergie',
  'Transports & Logistique', 'Immobilier & Construction', 'Public & Administrations', 'Concurrent',
]

function SecteurMultiSelect({ values, onChange, activeClass }: {
  values: string[]
  onChange: (v: string[]) => void
  activeClass: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(s: string) {
    onChange(values.includes(s) ? values.filter(v => v !== s) : [...values, s])
  }

  const displayLabel = (v: string) => v === '__null__' ? 'Sans secteur' : v
  const label = values.length === 0
    ? 'Tous les secteurs'
    : values.length === 1
      ? displayLabel(values[0])
      : `${values.length} secteurs`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 h-8 rounded-lg border border-input bg-transparent px-3 text-sm outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${values.length > 0 ? activeClass : ''}`}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-lg border bg-popover p-1 shadow-md max-h-80 overflow-y-auto">
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded-md"
            >
              Effacer la sélection
            </button>
          )}
          {[...SECTEURS, '__null__'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left hover:bg-accent rounded-md"
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${values.includes(s) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                {values.includes(s) && <Check className="h-3 w-3" />}
              </span>
              <span className={s === '__null__' ? 'italic text-muted-foreground' : ''}>{displayLabel(s)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Entreprises() {
  const { membre } = useAuth()
  const userIsAdmin = isAdmin(membre?.role)
  const [searchParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<string>(searchParams.get('tier') ?? 'all')
  const [statutFilter, setStatutFilter] = useState<string>(searchParams.get('statut') ?? 'all')
  const [secteurFilter, setSecteurFilter] = useState<string[]>(() => {
    const param = searchParams.get('secteur')
    return param ? param.split(',') : []
  })
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [amFilter, setAmFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Entreprise | null>(null)
  const [exporting, setExporting] = useState(false)

  const debouncedSearch = useDebouncedValue(search, 300)

  const restrictToMembreId = !userIsAdmin ? membre?.id ?? null : null

  const [amList, setAmList] = useState<{ id: string; full_name: string }[] | null>(null)
  const amFetchedRef = useRef(false)
  function ensureAmList() {
    if (amFetchedRef.current) return
    amFetchedRef.current = true
    supabase.from('membres_digilityx').select('id, full_name').eq('role', 'account_manager').order('full_name')
      .then(({ data }) => setAmList((data ?? []) as { id: string; full_name: string }[]))
  }
  useEffect(() => {
    if (amFilter !== 'all') ensureAmList()
  }, [amFilter])

  const hasActiveFilters = tierFilter !== 'all' || statutFilter !== 'all' || secteurFilter.length > 0 || clientFilter !== 'all' || amFilter !== 'all' || search.trim() !== ''
  const activeClass = 'border-primary bg-primary/10 text-primary'

  function clearAllFilters() {
    setTierFilter('all')
    setStatutFilter('all')
    setSecteurFilter([])
    setClientFilter('all')
    setAmFilter('all')
    setSearch('')
    setPage(0)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (query: any) => {
    let q = query
    if (tierFilter !== 'all') q = q.eq('tier', tierFilter)
    if (statutFilter !== 'all') q = q.eq('statut_entreprise', statutFilter)
    if (secteurFilter.length > 0) {
      const wantsNull = secteurFilter.includes('__null__')
      const realSecteurs = secteurFilter.filter(s => s !== '__null__')
      if (wantsNull && realSecteurs.length > 0) {
        const list = realSecteurs.map(s => `"${s}"`).join(',')
        q = q.or(`secteur_digi.is.null,secteur_digi.in.(${list})`)
      } else if (wantsNull) {
        q = q.is('secteur_digi', null)
      } else {
        q = q.in('secteur_digi', realSecteurs)
      }
    }
    if (clientFilter !== 'all') q = q.eq('statut_digi', clientFilter)
    if (amFilter !== 'all') q = q.eq('account_manager_id', amFilter)
    if (debouncedSearch.trim()) q = q.ilike('company_name', `%${debouncedSearch.trim()}%`)
    return q
  }

  const rpcParams = () => ({
    p_membre_id: restrictToMembreId!,
    p_tier: tierFilter === 'all' ? null : tierFilter,
    p_statut_entreprise: statutFilter === 'all' ? null : statutFilter,
    p_statut_digi: clientFilter === 'all' ? null : clientFilter,
    p_secteurs: secteurFilter.length === 0 ? null : secteurFilter.filter(s => s !== '__null__'),
    p_include_null_secteur: secteurFilter.includes('__null__'),
    p_account_manager_id: amFilter === 'all' ? null : amFilter,
    p_search: debouncedSearch.trim() || null,
  })

  async function handleExport() {
    setExporting(true)
    try {
      const allRows: Record<string, unknown>[] = []
      let offset = 0
      const BATCH = 1000
      while (true) {
        let data: Record<string, unknown>[] | null
        if (restrictToMembreId) {
          const res = await supabase.rpc('get_entreprises_for_membre', { ...rpcParams(), p_offset: offset, p_limit: BATCH })
          data = (res.data as Record<string, unknown>[] | null)
        } else {
          const res = await applyFilters(
            supabase.from('entreprises')
              .select('company_name, company_domain, company_location, company_employee_range, company_typology, secteur_digi, tier, statut_entreprise, statut_digi, icp, scoring_icp')
              .order('company_name', { ascending: true })
          ).range(offset, offset + BATCH - 1)
          data = res.data as Record<string, unknown>[] | null
        }
        if (!data || data.length === 0) break
        allRows.push(...data)
        if (data.length < BATCH) break
        offset += BATCH
      }

      const ws = XLSX.utils.json_to_sheet(allRows.map(r => ({
        'Entreprise': r.company_name,
        'Domaine': r.company_domain,
        'Localisation': r.company_location,
        'Taille': r.company_employee_range,
        'Typologie': r.company_typology,
        'Secteur': r.secteur_digi,
        'Tier': r.tier,
        'Statut': r.statut_entreprise,
        'Statut DIGI': r.statut_digi,
        'ICP': r.icp ? 'Oui' : 'Non',
        'Score ICP': r.scoring_icp,
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Entreprises')
      XLSX.writeFile(wb, `entreprises_export_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const { data: entreprises, loading, refetch } = useSupabaseQuery<EntrepriseWithParent[]>(
    async () => {
      if (restrictToMembreId) {
        const { data, error } = await supabase.rpc('get_entreprises_for_membre', { ...rpcParams(), p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE })
        const rows = (data ?? []) as Array<Record<string, unknown>>
        const mapped: EntrepriseWithParent[] = rows.map(r => ({
          ...(r as unknown as Entreprise),
          parent: r.parent_company_id
            ? { id: r.parent_company_id as string, company_name: (r.parent_company_name as string) ?? '' }
            : null,
          account_manager: r.account_manager_id
            ? { id: r.account_manager_id as string, full_name: (r.account_manager_name as string) ?? '' }
            : null,
        }))
        return { data: mapped, error }
      }
      return applyFilters(
        supabase.from('entreprises').select(
          'id, company_name, company_domain, company_id_linkedin, company_employee_count, company_employee_range, company_location, company_typology, secteur_digi, linkedin_industry, tier, statut_entreprise, statut_digi, icp, scoring_icp, justification, is_digi_client, is_subsidiary, is_parent_entity, account_manager_id, parent_company_id, source_acquisition, parent:parent_company_id(id, company_name), account_manager:account_manager_id(id, full_name)'
        ).order('company_name', { ascending: true })
      ).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    },
    [page, tierFilter, statutFilter, secteurFilter, clientFilter, amFilter, debouncedSearch, restrictToMembreId]
  )

  const { data: countResult } = useSupabaseQuery<{ count: number }[]>(
    async () => {
      if (restrictToMembreId) {
        const { data, error } = await supabase.rpc('count_entreprises_for_membre', rpcParams())
        return { data: [{ count: Number(data ?? 0) }], error }
      }
      const res = await applyFilters(
        supabase.from('entreprises').select('id', { count: 'exact', head: true })
      )
      return { data: [{ count: res.count ?? 0 }], error: res.error }
    },
    [tierFilter, statutFilter, secteurFilter, clientFilter, amFilter, debouncedSearch, restrictToMembreId]
  )

  const totalCount = countResult?.[0]?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasFilters = tierFilter !== 'all' || statutFilter !== 'all' || secteurFilter.length > 0 || clientFilter !== 'all' || search.trim() !== ''

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entreprises</h1>
        <p className="text-muted-foreground">
          {countResult ? (
            <>{totalCount.toLocaleString('fr-FR')} entreprise{totalCount > 1 ? 's' : ''}{hasFilters ? ' (filtrées)' : userIsAdmin ? ' en base' : ' liées à vous'}.</>
          ) : (
            <span className="inline-block h-4 w-48 animate-pulse rounded bg-muted" />
          )}
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

        <div className="flex items-center gap-1.5 rounded-lg border border-border px-1.5 py-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">Statuts</span>
          <Select value={statutFilter} onValueChange={(v) => { setStatutFilter(v as string); setPage(0) }}>
            <SelectTrigger className={`h-7 text-xs ${statutFilter !== 'all' ? activeClass : ''}`}>
              <SelectValue>{statutFilter === 'all' ? 'Commercial' : statutFilter}</SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[220px]">
              <SelectItem value="all">Tous (commercial)</SelectItem>
              <SelectItem value="À démarcher">À démarcher</SelectItem>
              <SelectItem value="Activement démarché">Activement démarché</SelectItem>
              <SelectItem value="Deal en cours">Deal en cours</SelectItem>
              <SelectItem value="Devenu client Digileads">Devenu client Digileads</SelectItem>
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v as string); setPage(0) }}>
            <SelectTrigger className={`h-7 text-xs ${clientFilter !== 'all' ? activeClass : ''}`}>
              <SelectValue>{clientFilter === 'all' ? 'Digi' : clientFilter}</SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[260px]">
              <SelectItem value="all">Tous (Digi)</SelectItem>
              <SelectItem value="Client Digi - pas de mission">Client Digi - pas de mission</SelectItem>
              <SelectItem value="Client Digi - mission en cours">Client Digi - mission en cours</SelectItem>
              <SelectItem value="Pas client Digi">Pas client Digi</SelectItem>
              <SelectItem value="Client Digileads">Client Digileads</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <SecteurMultiSelect
          values={secteurFilter}
          onChange={(v) => { setSecteurFilter(v); setPage(0) }}
          activeClass={activeClass}
        />

        <Select value={amFilter} onValueChange={(v) => { setAmFilter(v as string); setPage(0) }} onOpenChange={(open) => { if (open) ensureAmList() }}>
          <SelectTrigger className={amFilter !== 'all' ? activeClass : ''}>
            <SelectValue>{amFilter === 'all' ? 'Tout AM' : amList?.find(m => m.id === amFilter)?.full_name ?? amFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tout AM</SelectItem>
            {(amList ?? []).map(m => (
              <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
            ))}
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

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting || totalCount === 0}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
          Export Excel
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20%]">Entreprise</TableHead>
                <TableHead className="w-[13%]">Localisation</TableHead>
                <TableHead className="w-[8%]">Taille</TableHead>
                <TableHead className="w-[12%]">Secteur</TableHead>
                <TableHead className="w-[7%]">Tier</TableHead>
                <TableHead className="w-[10%]">Statut</TableHead>
                <TableHead className="w-[10%]">AM</TableHead>
                <TableHead className="w-[6%]">ICP</TableHead>
                <TableHead className="w-[7%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
                  <TableHead className="w-[20%]">Entreprise</TableHead>
                  <TableHead className="w-[13%]">Localisation</TableHead>
                  <TableHead className="w-[8%]">Taille</TableHead>
                  <TableHead className="w-[12%]">Secteur</TableHead>
                  <TableHead className="w-[7%]">Tier</TableHead>
                  <TableHead className="w-[10%]">Statut</TableHead>
                  <TableHead className="w-[10%]">AM</TableHead>
                  <TableHead className="w-[6%]">ICP</TableHead>
                  <TableHead className="w-[7%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entreprises.map(e => (
                  <TableRow
                    key={e.id}
                    className={userIsAdmin ? 'cursor-pointer' : ''}
                    onClick={() => userIsAdmin && setSelected(e)}
                  >
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
                    <TableCell>
                      <p className="text-sm text-muted-foreground">
                        {e.company_employee_range ?? (e.company_employee_count ? `${e.company_employee_count.toLocaleString('fr-FR')} emp.` : '—')}
                      </p>
                      {e.company_typology && (
                        <p className="text-xs text-muted-foreground/70">{e.company_typology}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-0">
                      {e.secteur_digi ? (
                        <Badge variant="outline" className="max-w-full justify-start truncate" title={e.secteur_digi}>
                          {e.secteur_digi}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {e.linkedin_industry && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate" title={e.linkedin_industry}>
                          {e.linkedin_industry}
                        </p>
                      )}
                    </TableCell>
                    <TableCell><TierBadge tier={e.tier} /></TableCell>
                    <TableCell><StatutBadge statut={e.statut_entreprise} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[120px]">
                      {e.account_manager?.full_name ?? '—'}
                    </TableCell>
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

      {userIsAdmin && (
        <EntrepriseDrawer
          entreprise={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); refetch() }}
        />
      )}
    </div>
  )
}
