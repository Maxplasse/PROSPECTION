import { useState, useEffect, useRef } from 'react'
import { Loader2, Users, Building2, UserCircle, ChevronDown, Check, Download, Layers } from 'lucide-react'
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
import { NIVEAU_RELATION_DESCRIPTIONS, type NiveauRelation } from '@/lib/types'

interface MembreStats {
  id: string
  full_name: string
  total: number
  totalReseau: number
  byStatut: Record<string, number>
  unqualifiedTier1: number
}

const statsCache: {
  owner: MembreStats[] | null
  am: MembreStats[] | null
  tier: MembreStats[] | null
} = { owner: null, am: null, tier: null }

const STATUTS_ENTREPRISE = [
  'À démarcher', 'Activement démarché', 'Deal en cours', 'Devenu client Digileads',
]

const STATUTS_CONTACT = [
  'À contacter', 'Contacté', 'Intéressé', 'Pas intéressé', 'Client',
]

const TIERS = ['Tier 1', 'Tier 2', 'Tier 3', 'Hors-Tier', 'Sans tier']

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

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Jamais relancé'
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)
  if (hours < 1) return "À l'instant"
  if (hours < 24) return `Il y a ${hours}h`
  if (days === 1) return 'Il y a 1 jour'
  return `Il y a ${days} jours`
}

function isWithin24h(dateStr: string | null): boolean {
  if (!dateStr) return false
  return (Date.now() - new Date(dateStr).getTime()) < 86_400_000
}

type Tab = 'owner' | 'account_manager' | 'tier' | 'membre_digi'

export default function Membres() {
  const [tab, setTab] = useState<Tab>('owner')
  const [membresCount, setMembresCount] = useState(0)
  const [tierOnlyUnqualified, setTierOnlyUnqualified] = useState(false)
  const [ownerStats, setOwnerStats] = useState<MembreStats[]>(statsCache.owner ?? [])
  const [amStats, setAmStats] = useState<MembreStats[]>(statsCache.am ?? [])
  const [tierStats, setTierStats] = useState<MembreStats[]>(statsCache.tier ?? [])
  const [loadingOwner, setLoadingOwner] = useState(statsCache.owner === null)
  const [loadingAM, setLoadingAM] = useState(statsCache.am === null)
  const [loadingTier, setLoadingTier] = useState(statsCache.tier === null)
  const [tierSlackState, setTierSlackState] = useState<Record<string, 'sending' | 'sent'>>({})
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  const ownerLoadedRef = useRef(statsCache.owner !== null)
  const amLoadedRef = useRef(statsCache.am !== null)
  const tierLoadedRef = useRef(statsCache.tier !== null)

  // Vue Membre Digi
  const [allMembres, setAllMembres] = useState<{ id: string; full_name: string; slack_user_id: string | null; last_slack_nudge_at: string | null }[]>([])
  const [selectedMembre, setSelectedMembre] = useState<string>('all')
  const [membreTierFilter, setMembreTierFilter] = useState<string>('all')
  const [membreSecteurFilter, setMembreSecteurFilter] = useState<string[]>([])
  const [membreContacts, setMembreContacts] = useState<MembreContact[]>([])
  const [totalMembreContacts, setTotalMembreContacts] = useState<number | null>(null)
  const [loadingMembreContacts, setLoadingMembreContacts] = useState(false)
  const [sendingSlack, setSendingSlack] = useState(false)
  const [slackSent, setSlackSent] = useState(false)

  // Lightweight membres list — always needed (header count + Membre Digi selector)
  useEffect(() => {
    supabase
      .from('membres_digilityx')
      .select('id, full_name, slack_user_id, last_slack_nudge_at')
      .eq('actif', true)
      .eq('partager_contacts', true)
      .order('full_name')
      .then(({ data }) => {
        const list = (data ?? []) as { id: string; full_name: string; slack_user_id: string | null; last_slack_nudge_at: string | null }[]
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
    } else if (tab === 'tier' && !tierLoadedRef.current) {
      tierLoadedRef.current = true
      loadTierStats(allMembres)
    }
  }, [tab, allMembres])

  async function loadOwnerStats(membres: typeof allMembres) {
    setLoadingOwner(true)

    const [reseauResults, { data: ownerRpc }] = await Promise.all([
      (async () => {
        const counts: Record<string, number> = {}
        for (const m of membres) {
          const { data } = await supabase.rpc('count_contacts_for_membre', { p_membre_id: m.id })
          counts[m.id] = typeof data === 'number' ? data : 0
        }
        return counts
      })(),
      supabase.rpc('get_owner_contact_stats'),
    ])

    const ownerLookup = new Map<string, Record<string, number>>()
    for (const row of (ownerRpc ?? []) as { owner_membre_id: string; statut_contact: string | null; cnt: number }[]) {
      if (!ownerLookup.has(row.owner_membre_id)) ownerLookup.set(row.owner_membre_id, {})
      ownerLookup.get(row.owner_membre_id)![row.statut_contact ?? '(vide)'] = Number(row.cnt)
    }

    const results: MembreStats[] = membres.map(m => {
      const counts = ownerLookup.get(m.id) ?? {}
      const byStatut: Record<string, number> = {}
      let total = 0
      for (const s of STATUTS_CONTACT) {
        byStatut[s] = counts[s] ?? 0
        total += byStatut[s]
      }
      for (const [k, v] of Object.entries(counts)) {
        if (!STATUTS_CONTACT.includes(k)) total += v
      }
      return { ...m, total, totalReseau: reseauResults[m.id] ?? 0, byStatut, unqualifiedTier1: 0 }
    })

    const sorted = results.sort((a, b) => b.totalReseau - a.totalReseau)
    statsCache.owner = sorted
    setOwnerStats(sorted)
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
      return { ...m, total, totalReseau: 0, byStatut, unqualifiedTier1: 0 }
    })

    const sorted = stats.sort((a, b) => b.total - a.total)
    statsCache.am = sorted
    setAmStats(sorted)
    setLoadingAM(false)
  }

  async function loadTierStats(membres: typeof allMembres) {
    setLoadingTier(true)
    const [{ data: rpcData }, { data: unqualifiedData }] = await Promise.all([
      supabase.rpc('get_membre_relations_by_tier'),
      supabase.rpc('get_membre_tier1_unqualified_count'),
    ])

    const lookup = new Map<string, Record<string, number>>()
    for (const row of (rpcData ?? []) as { membre_id: string; tier: string; cnt: number }[]) {
      if (!lookup.has(row.membre_id)) lookup.set(row.membre_id, {})
      lookup.get(row.membre_id)![row.tier] = Number(row.cnt)
    }

    const unqualifiedLookup = new Map<string, number>()
    for (const row of (unqualifiedData ?? []) as { membre_id: string; cnt: number }[]) {
      unqualifiedLookup.set(row.membre_id, Number(row.cnt))
    }

    const stats: MembreStats[] = membres.map(m => {
      const counts = lookup.get(m.id) ?? {}
      const byStatut: Record<string, number> = {}
      let total = 0
      for (const t of TIERS) {
        byStatut[t] = counts[t] ?? 0
        total += byStatut[t]
      }
      return { ...m, total, totalReseau: 0, byStatut, unqualifiedTier1: unqualifiedLookup.get(m.id) ?? 0 }
    })

    // Sort by Tier 1 desc — flag the most connected on hot accounts first
    const sorted = stats.sort((a, b) => (b.byStatut['Tier 1'] ?? 0) - (a.byStatut['Tier 1'] ?? 0))
    statsCache.tier = sorted
    setTierStats(sorted)
    setLoadingTier(false)
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
    setTotalMembreContacts(null)
    Promise.all([
      supabase.rpc('get_membre_contacts', { p_membre_id: selectedMembre }),
      supabase.rpc('count_contacts_for_membre', { p_membre_id: selectedMembre }),
    ]).then(([{ data }, { data: count }]) => {
      setMembreContacts((data ?? []) as MembreContact[])
      setTotalMembreContacts(typeof count === 'number' ? count : null)
      setLoadingMembreContacts(false)
    })
  }, [tab, selectedMembre])

  const isLoading = tab === 'owner' ? loadingOwner
    : tab === 'account_manager' ? loadingAM
    : tab === 'tier' ? loadingTier
    : false
  const stats = tab === 'owner' ? ownerStats
    : tab === 'account_manager' ? amStats
    : tierStats
  const statuts = tab === 'owner' ? STATUTS_CONTACT
    : tab === 'account_manager' ? STATUTS_ENTREPRISE
    : TIERS
  const label = tab === 'account_manager' ? 'entreprises' : 'contacts'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membres Digi</h1>
        <p className="text-muted-foreground">
          {membresCount} membres · {tab === 'owner' ? 'Contacts réseau + owner.' : tab === 'account_manager' ? 'Entreprises par AM.' : tab === 'tier' ? 'Relations par tier.' : 'Contacts par membre Digi.'}.
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
          onClick={() => setTab('tier')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'tier'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="h-4 w-4" />
          Vue Tier
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
                    <SelectItem value="all">Tous les tiers ({totalMembreContacts ?? membreContacts.length})</SelectItem>
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
                  {totalMembreContacts !== null && totalMembreContacts > membreContacts.length && membreTierFilter === 'all' && membreSecteurFilter.length === 0 && (
                    <span className="ml-1 text-muted-foreground/60">(sur {totalMembreContacts} au total)</span>
                  )}
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
                      const nudgeBlocked = isWithin24h(membre.last_slack_nudge_at)
                      return (
                        <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={nudgeBlocked || sendingSlack || slackSent}
                          title={nudgeBlocked ? 'Relance possible dans 24h' : undefined}
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
                              const nudgeAt = new Date().toISOString()
                              await supabase.from('membres_digilityx').update({ last_slack_nudge_at: nudgeAt }).eq('id', selectedMembre)
                              setAllMembres(prev => prev.map(a => a.id === selectedMembre ? { ...a, last_slack_nudge_at: nudgeAt } : a))
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
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(membre.last_slack_nudge_at)}
                        </span>
                        </>
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
                            <Badge
                              variant="outline"
                              title={NIVEAU_RELATION_DESCRIPTIONS[c.niveau_de_relation as NiveauRelation] ?? ''}
                            >
                              {c.niveau_de_relation}
                            </Badge>
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
        <>
          {tab === 'tier' && (() => {
            const eligible = tierStats.filter(m => {
              if (m.unqualifiedTier1 === 0) return false
              const info = allMembres.find(a => a.id === m.id)
              return info?.slack_user_id && !isWithin24h(info.last_slack_nudge_at)
            })
            return (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTierOnlyUnqualified(v => !v)}
                  className={`inline-flex items-center gap-1.5 h-8 rounded-lg border px-3 text-sm transition-colors ${
                    tierOnlyUnqualified
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : 'border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  À qualifier T1 uniquement
                </button>
                {eligible.length > 0 && (
                  <button
                    type="button"
                    disabled={bulkSending}
                    onClick={async () => {
                      if (!window.confirm(`Envoyer une relance Slack à ${eligible.length} membre${eligible.length > 1 ? 's' : ''} ?`)) return
                      setBulkSending(true)
                      setBulkProgress({ done: 0, total: eligible.length })
                      const appUrl = window.location.origin + '/membres'
                      for (let i = 0; i < eligible.length; i++) {
                        const m = eligible[i]
                        const info = allMembres.find(a => a.id === m.id)!
                        try {
                          await supabase.functions.invoke('send-slack-notification', {
                            body: {
                              slack_user_id: info.slack_user_id,
                              message: `Salut ${m.full_name.split(' ')[0]}, tu as ${m.unqualifiedTier1} contact${m.unqualifiedTier1 > 1 ? 's' : ''} Tier 1 dont la relation est à qualifier. Merci de mettre à jour tes relations sur ${appUrl}`,
                            },
                          })
                          const nudgeAt = new Date().toISOString()
                          await supabase.from('membres_digilityx').update({ last_slack_nudge_at: nudgeAt }).eq('id', m.id)
                          setAllMembres(prev => prev.map(a => a.id === m.id ? { ...a, last_slack_nudge_at: nudgeAt } : a))
                        } catch { /* continue on error */ }
                        setBulkProgress({ done: i + 1, total: eligible.length })
                      }
                      setBulkSending(false)
                      setTimeout(() => setBulkProgress(null), 4000)
                    }}
                    className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-input bg-transparent px-3 text-sm hover:bg-accent disabled:opacity-50 transition-colors"
                  >
                    {bulkSending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {bulkProgress?.done}/{bulkProgress?.total}
                      </>
                    ) : bulkProgress && !bulkSending ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        {bulkProgress.total} envoyés
                      </>
                    ) : (
                      <>
                        <img src="/slack-logo.jpg" alt="Slack" className="h-3.5 w-3.5 rounded-sm" />
                        Relancer les {eligible.length}
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          })()}
          <div className="rounded-lg border border-border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Membre</TableHead>
                    {tab === 'owner' && <TableHead className="text-center">Total contacts</TableHead>}
                    <TableHead className="text-center">{tab === 'owner' ? 'Total owner' : `Total ${label}`}</TableHead>
                    {statuts.map(s => (
                      <TableHead key={s} className="text-center text-xs">{s}</TableHead>
                    ))}
                    {tab === 'tier' && <TableHead className="text-center text-xs">À qualifier T1</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.filter(m => m.total > 0 && (!tierOnlyUnqualified || m.unqualifiedTier1 > 0)).map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium whitespace-nowrap">{m.full_name}</TableCell>
                      {tab === 'owner' && (
                        <TableCell className="text-center">
                          <span className="font-bold">{m.totalReseau}</span>
                        </TableCell>
                      )}
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
                      {tab === 'tier' && (
                        <TableCell className="text-center">
                          {m.unqualifiedTier1 > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-2">
                              <Badge variant="destructive" className="text-xs tabular-nums">
                                {m.unqualifiedTier1}
                              </Badge>
                              {(() => {
                                const membreInfo = allMembres.find(a => a.id === m.id)
                                if (!membreInfo?.slack_user_id) return null
                                const state = tierSlackState[m.id]
                                const blocked = isWithin24h(membreInfo.last_slack_nudge_at)
                                return (
                                  <button
                                    type="button"
                                    disabled={blocked || state === 'sending' || state === 'sent'}
                                    title={blocked ? 'Relance possible dans 24h' : state === 'sent' ? 'Message envoyé !' : 'Relancer sur Slack'}
                                    className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50 transition-colors"
                                    onClick={async () => {
                                      setTierSlackState(prev => ({ ...prev, [m.id]: 'sending' }))
                                      try {
                                        const appUrl = window.location.origin + '/membres'
                                        await supabase.functions.invoke('send-slack-notification', {
                                          body: {
                                            slack_user_id: membreInfo.slack_user_id,
                                            message: `Salut ${m.full_name.split(' ')[0]}, tu as ${m.unqualifiedTier1} contact${m.unqualifiedTier1 > 1 ? 's' : ''} Tier 1 dont la relation est à qualifier. Merci de mettre à jour tes relations sur ${appUrl}`,
                                          },
                                        })
                                        const nudgeAt = new Date().toISOString()
                                        await supabase.from('membres_digilityx').update({ last_slack_nudge_at: nudgeAt }).eq('id', m.id)
                                        setAllMembres(prev => prev.map(a => a.id === m.id ? { ...a, last_slack_nudge_at: nudgeAt } : a))
                                        setTierSlackState(prev => ({ ...prev, [m.id]: 'sent' }))
                                        setTimeout(() => setTierSlackState(prev => {
                                          const next = { ...prev }
                                          delete next[m.id]
                                          return next
                                        }), 5000)
                                      } catch {
                                        setTierSlackState(prev => {
                                          const next = { ...prev }
                                          delete next[m.id]
                                          return next
                                        })
                                      }
                                    }}
                                  >
                                    {state === 'sending' ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : state === 'sent' ? (
                                      <Check className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <img src="/slack-logo.jpg" alt="Slack" className="h-3.5 w-3.5 rounded-sm" />
                                    )}
                                    {state === 'sent' ? 'Envoyé' : 'Relancer'}
                                  </button>
                                )
                              })()}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {relativeTime(allMembres.find(a => a.id === m.id)?.last_slack_nudge_at ?? null)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-emerald-600">✓</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {stats.filter(m => m.total === 0).length > 0 && (
                    <TableRow>
                      <TableCell colSpan={statuts.length + 2 + (tab === 'tier' ? 1 : 0)} className="text-center text-sm text-muted-foreground py-3">
                        {stats.filter(m => m.total === 0).length} membres sans {label}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
          </div>
        </>
      )}
    </div>
  )
}
