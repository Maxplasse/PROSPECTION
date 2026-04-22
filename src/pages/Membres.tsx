import { useState, useEffect, useRef } from 'react'
import { Loader2, Users, Building2, UserCircle, ChevronDown, Check, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface MembreStats {
  id: string
  full_name: string
  total: number
  byStatut: Record<string, number>
}

const STATUTS_ENTREPRISE = [
  'À démarcher', 'Activement démarché', 'Deal en cours', 'Devenu client Digileads',
]

const STATUTS_CONTACT = [
  'À contacter', 'Contacté', 'Intéressé', 'Pas intéressé', 'Client',
]

interface MembreContact {
  id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  company_name: string | null
  statut_contact: string | null
  scoring: number
  niveau_de_relation: string | null
  tier: string | null
  secteur_digi: string | null
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

type Tab = 'owner' | 'account_manager' | 'membre_digi'

export default function Membres() {
  const [tab, setTab] = useState<Tab>('owner')
  const [membresCount, setMembresCount] = useState(0)
  const [ownerStats, setOwnerStats] = useState<MembreStats[]>([])
  const [amStats, setAmStats] = useState<MembreStats[]>([])
  // Both default to true: tabs show a spinner until their data lands (or the tab is first opened)
  const [loadingOwner, setLoadingOwner] = useState(true)
  const [loadingAM, setLoadingAM] = useState(true)
  const ownerLoadedRef = useRef(false)
  const amLoadedRef = useRef(false)

  // Vue Membre Digi
  const [allMembres, setAllMembres] = useState<{ id: string; full_name: string; slack_user_id: string | null }[]>([])
  const [selectedMembre, setSelectedMembre] = useState<string>('all')
  const [membreTierFilter, setMembreTierFilter] = useState<string>('all')
  const [membreSecteurFilter, setMembreSecteurFilter] = useState<string[]>([])
  const [membreContacts, setMembreContacts] = useState<MembreContact[]>([])
  const [loadingMembreContacts, setLoadingMembreContacts] = useState(false)
  const [sendingSlack, setSendingSlack] = useState(false)
  const [slackSent, setSlackSent] = useState(false)

  // Lightweight membres list — always needed (header count + Membre Digi selector)
  useEffect(() => {
    supabase
      .from('membres_digilityx')
      .select('id, full_name, slack_user_id')
      .order('full_name')
      .then(({ data }) => {
        const list = data ?? []
        setAllMembres(list)
        setMembresCount(list.length)
      })
  }, [])

  // Lazy-load stats the first time each tab is opened — waits for membres list
  useEffect(() => {
    if (allMembres.length === 0) return
    if (tab === 'owner' && !ownerLoadedRef.current) {
      ownerLoadedRef.current = true
      loadOwnerStats(allMembres)
    } else if (tab === 'account_manager' && !amLoadedRef.current) {
      amLoadedRef.current = true
      loadAMStats(allMembres)
    }
  }, [tab, allMembres])

  async function loadOwnerStats(membres: typeof allMembres) {
    setLoadingOwner(true)
    const { data: rpcData } = await supabase.rpc('get_owner_contact_stats')

    const lookup = new Map<string, Record<string, number>>()
    for (const row of (rpcData ?? []) as { owner_membre_id: string; statut_contact: string | null; cnt: number }[]) {
      if (!lookup.has(row.owner_membre_id)) lookup.set(row.owner_membre_id, {})
      const key = row.statut_contact ?? '(vide)'
      lookup.get(row.owner_membre_id)![key] = Number(row.cnt)
    }

    const stats: MembreStats[] = membres.map(m => {
      const counts = lookup.get(m.id) ?? {}
      const byStatut: Record<string, number> = {}
      let total = 0
      for (const s of STATUTS_CONTACT) {
        byStatut[s] = counts[s] ?? 0
        total += byStatut[s]
      }
      for (const [k, v] of Object.entries(counts)) {
        if (!STATUTS_CONTACT.includes(k)) total += v
      }
      return { ...m, total, byStatut }
    })

    setOwnerStats(stats.sort((a, b) => b.total - a.total))
    setLoadingOwner(false)
  }

  async function loadAMStats(membres: typeof allMembres) {
    setLoadingAM(true)
    const { data: rpcData } = await supabase.rpc('get_am_entreprise_stats')

    const lookup = new Map<string, Record<string, number>>()
    for (const row of (rpcData ?? []) as { account_manager_id: string; statut_entreprise: string | null; cnt: number }[]) {
      if (!lookup.has(row.account_manager_id)) lookup.set(row.account_manager_id, {})
      const key = row.statut_entreprise ?? '(vide)'
      lookup.get(row.account_manager_id)![key] = Number(row.cnt)
    }

    const stats: MembreStats[] = membres.map(m => {
      const counts = lookup.get(m.id) ?? {}
      const byStatut: Record<string, number> = {}
      let total = 0
      for (const s of STATUTS_ENTREPRISE) {
        byStatut[s] = counts[s] ?? 0
        total += byStatut[s]
      }
      for (const [k, v] of Object.entries(counts)) {
        if (!STATUTS_ENTREPRISE.includes(k)) total += v
      }
      return { ...m, total, byStatut }
    })

    setAmStats(stats.sort((a, b) => b.total - a.total))
    setLoadingAM(false)
  }

  // Load contacts for selected membre
  useEffect(() => {
    if (tab !== 'membre_digi' || selectedMembre === 'all') {
      setMembreContacts([])
      return
    }
    setLoadingMembreContacts(true)
    setMembreTierFilter('all')
    setMembreSecteurFilter([])
    setSlackSent(false)
    supabase
      .rpc('get_membre_contacts', { p_membre_id: selectedMembre })
      .then(({ data }) => {
        setMembreContacts((data ?? []) as MembreContact[])
        setLoadingMembreContacts(false)
      })
  }, [tab, selectedMembre])

  const isLoading = tab === 'owner' ? loadingOwner : tab === 'account_manager' ? loadingAM : false
  const stats = tab === 'owner' ? ownerStats : amStats
  const statuts = tab === 'owner' ? STATUTS_CONTACT : STATUTS_ENTREPRISE
  const label = tab === 'owner' ? 'contacts' : 'entreprises'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membres Digi</h1>
        <p className="text-muted-foreground">
          {membresCount} membres · {tab === 'owner' ? 'Contacts par owner' : tab === 'account_manager' ? 'Entreprises par AM' : 'Contacts par membre Digi'}.
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
        <button
          onClick={() => setTab('membre_digi')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'membre_digi'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserCircle className="h-4 w-4" />
          Vue Membre Digi
        </button>
      </div>

      {/* Content */}
      {tab === 'membre_digi' ? (
        <div className="space-y-4">
          <Select value={selectedMembre} onValueChange={(v) => { if (v) setSelectedMembre(v) }}>
            <SelectTrigger className="w-[280px]">
              <SelectValue>{selectedMembre === 'all' ? 'Sélectionner un membre' : allMembres.find(m => m.id === selectedMembre)?.full_name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les membres</SelectItem>
              {allMembres.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedMembre === 'all' ? (
            <div className="rounded-lg border border-border bg-card p-12 text-center">
              <UserCircle className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">Sélectionnez un membre pour voir ses contacts liés.</p>
            </div>
          ) : loadingMembreContacts ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : membreContacts.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">Aucun contact lié à ce membre.</p>
            </div>
          ) : (() => {
            let filtered = membreTierFilter === 'all' ? membreContacts : membreContacts.filter(c => c.tier === membreTierFilter)
            if (membreSecteurFilter.length > 0) {
              const wantsNull = membreSecteurFilter.includes('__null__')
              const realSecteurs = membreSecteurFilter.filter(s => s !== '__null__')
              filtered = filtered.filter(c =>
                (wantsNull && !c.secteur_digi) ||
                (c.secteur_digi !== null && realSecteurs.includes(c.secteur_digi))
              )
            }
            const aTraiter = filtered.filter(c => !c.niveau_de_relation || c.niveau_de_relation === 'Non renseigné').length
            const tierCounts = { 'Tier 1': 0, 'Tier 2': 0, 'Tier 3': 0, 'Hors-Tier': 0, 'Sans tier': 0 }
            for (const c of membreContacts) {
              if (c.tier && c.tier in tierCounts) tierCounts[c.tier as keyof typeof tierCounts]++
              else tierCounts['Sans tier']++
            }
            return (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={membreTierFilter} onValueChange={(v) => { if (v) setMembreTierFilter(v) }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue>{membreTierFilter === 'all' ? 'Tous les tiers' : membreTierFilter}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les tiers ({membreContacts.length})</SelectItem>
                    {Object.entries(tierCounts).filter(([, n]) => n > 0).map(([t, n]) => (
                      <SelectItem key={t} value={t}>{t} ({n})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <SecteurMultiSelect
                  values={membreSecteurFilter}
                  onChange={(v) => setMembreSecteurFilter(v)}
                  activeClass="border-primary bg-primary/10 text-primary"
                />

                <p className="text-sm text-muted-foreground">
                  {filtered.length} contact{filtered.length > 1 ? 's' : ''}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={filtered.length === 0}
                  onClick={() => {
                    const membreName = allMembres.find(m => m.id === selectedMembre)?.full_name ?? 'membre'
                    const ws = XLSX.utils.json_to_sheet(filtered.map(c => ({
                      'Prénom': c.first_name,
                      'Nom': c.last_name,
                      'Poste': c.position,
                      'Entreprise': c.company_name,
                      'Secteur': c.secteur_digi,
                      'Tier': c.tier,
                      'Relation': c.niveau_de_relation,
                      'Statut': c.statut_contact,
                      'Score': c.scoring,
                    })))
                    const wb = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(wb, ws, 'Contacts')
                    const suffix = membreSecteurFilter.length > 0 ? `_${membreSecteurFilter.join('-')}` : ''
                    XLSX.writeFile(wb, `contacts_${membreName.replace(/\s+/g, '_')}${suffix}.xlsx`)
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export Excel
                </Button>

                {aTraiter > 0 && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Badge variant="destructive">
                      {aTraiter} relation{aTraiter > 1 ? 's' : ''} à qualifier
                    </Badge>
                    {(() => {
                      const membre = allMembres.find(m => m.id === selectedMembre)
                      if (!membre?.slack_user_id) return null
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={sendingSlack || slackSent}
                          onClick={async () => {
                            setSendingSlack(true)
                            try {
                              const appUrl = window.location.origin + '/membres'
                              await supabase.functions.invoke('send-slack-notification', {
                                body: {
                                  slack_user_id: membre.slack_user_id,
                                  message: `Salut ${membre.full_name.split(' ')[0]}, tu as ${aTraiter} contact${aTraiter > 1 ? 's' : ''} dont la relation est à qualifier. Merci de mettre à jour tes relations sur ${appUrl}`,
                                },
                              })
                              setSlackSent(true)
                              setTimeout(() => setSlackSent(false), 5000)
                            } finally {
                              setSendingSlack(false)
                            }
                          }}
                        >
                          {sendingSlack ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <img src="/slack-logo.jpg" alt="Slack" className="h-4 w-4 mr-1.5 rounded-sm" />
                          )}
                          {slackSent ? 'Envoyé !' : 'Relancer sur Slack'}
                        </Button>
                      )
                    })()}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Entreprise</TableHead>
                      <TableHead>Relation</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(c => (
                      <TableRow key={c.id} className={!c.niveau_de_relation || c.niveau_de_relation === 'Non renseigné' ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                        <TableCell>
                          <Link to={`/contacts?contact=${c.id}`} className="hover:underline">
                            <p className="font-medium text-sm">{c.first_name} {c.last_name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.position ?? '—'}</p>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{c.company_name ?? '—'}</TableCell>
                        <TableCell>
                          {c.niveau_de_relation && c.niveau_de_relation !== 'Non renseigné' ? (
                            <Badge variant="outline">{c.niveau_de_relation}</Badge>
                          ) : <Badge variant="destructive" className="text-xs">À qualifier</Badge>}
                        </TableCell>
                        <TableCell>
                          {c.statut_contact ? (
                            <Badge variant="secondary">{c.statut_contact}</Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm font-medium ${c.scoring >= 70 ? 'text-emerald-600' : c.scoring >= 40 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {c.scoring}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
            )
          })()}
        </div>
      ) : isLoading ? (
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
