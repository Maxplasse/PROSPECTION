import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, Save, Loader2, Crown, ChevronDown, Search, Building2, History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Drawer, FieldGroup, SelectField, TextField } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { scoreContact } from '@/lib/scoring/score-contact'
import type {
  Persona, Hierarchie, StatutContact, NiveauRelation,
} from '@/lib/types'

const PERSONAS: Persona[] = [
  'Dirigeant', 'Marketing', 'Produit', 'Design', 'Hors expertise Digi',
]
const HIERARCHIES: Hierarchie[] = ['COMEX', 'Directeur', 'Manager', 'Opérationnel']
const STATUTS: StatutContact[] = [
  'À contacter', 'Contacté', 'Intéressé',
  'Pas intéressé', 'Client',
]
const NIVEAUX_RELATION: NiveauRelation[] = [
  'Ami', 'Cercle familial', 'Ancien collègue', 'Alumni',
  'Partenaire business', 'Connaissance', 'Inconnu', 'Non renseigné',
]

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
  owner_membre_id?: string | null
}

interface RelationRow {
  id: string
  membre_id: string
  niveau_de_relation: string | null
  membres_digilityx: { full_name: string } | null
}

interface MembreOption {
  id: string
  full_name: string
}

interface EntrepriseOption {
  id: string
  company_name: string
}

interface SnapshotRow {
  id: string
  scraped_at: string
  position: string | null
  company_name: string | null
  location: string | null
  summary: string | null
}

interface Props {
  contact: ContactRow | null
  onClose: () => void
  onSaved: () => void
  isAdmin?: boolean
}

export function ContactDrawer({ contact, onClose, onSaved, isAdmin: adminMode = true }: Props) {
  const [position, setPosition] = useState<string | null>(null)
  const [persona, setPersona] = useState<string | null>(null)
  const [hierarchie, setHierarchie] = useState<string | null>(null)
  const [statut, setStatut] = useState<string | null>(null)
  const [contactDigi, setContactDigi] = useState(false)
  const [saving, setSaving] = useState(false)

  // Owner
  const [ownerMembreId, setOwnerMembreId] = useState<string | null>(null)
  const [membres, setMembres] = useState<MembreOption[]>([])

  // Entreprise linking
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null)
  const [entrepriseSearch, setEntrepriseSearch] = useState('')
  const [entrepriseResults, setEntrepriseResults] = useState<EntrepriseOption[]>([])
  const [entrepriseSearching, setEntrepriseSearching] = useState(false)
  const [linkedEntrepriseName, setLinkedEntrepriseName] = useState<string | null>(null)

  // Relations
  const [relations, setRelations] = useState<RelationRow[]>([])
  const [relationChanges, setRelationChanges] = useState<Record<string, string>>({})
  const [loadingRelations, setLoadingRelations] = useState(false)
  const [relationsOpen, setRelationsOpen] = useState(false)

  // Scraping history
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (contact) {
      setPosition(contact.position)
      setPersona(contact.persona)
      setHierarchie(contact.hierarchie)
      setStatut(contact.statut_contact)
      setContactDigi(contact.contact_digi)
      setEntrepriseId(contact.entreprise_id)
      setRelationChanges({})
      setEntrepriseSearch('')
      setEntrepriseResults([])
      setLinkedEntrepriseName(null)

      // Fetch relations, owner, linked entreprise name, and membres
      setLoadingRelations(true)
      Promise.all([
        supabase
          .from('contacts_membres_relations')
          .select('id, membre_id, niveau_de_relation, membres_digilityx(full_name)')
          .eq('contact_id', contact.id)
          .order('niveau_de_relation'),
        supabase
          .from('contacts')
          .select('owner_membre_id')
          .eq('id', contact.id)
          .single(),
        supabase
          .from('membres_digilityx')
          .select('id, full_name')
          .order('full_name'),
        contact.entreprise_id
          ? supabase
              .from('entreprises')
              .select('id, company_name')
              .eq('id', contact.entreprise_id)
              .single()
          : Promise.resolve({ data: null }),
      ]).then(([relRes, ownerRes, membresRes, entRes]) => {
        setRelations((relRes.data ?? []) as unknown as RelationRow[])
        setOwnerMembreId(ownerRes.data?.owner_membre_id ?? null)
        setMembres((membresRes.data ?? []) as MembreOption[])
        if (entRes.data) {
          setLinkedEntrepriseName((entRes.data as EntrepriseOption).company_name)
        }
        setLoadingRelations(false)
      })

      // Fetch scraping snapshots
      setLoadingSnapshots(true)
      supabase
        .from('scraping_snapshots')
        .select('id, scraped_at, position, company_name, location, summary')
        .eq('contact_id', contact.id)
        .order('scraped_at', { ascending: false })
        .limit(10)
        .then(({ data }) => {
          setSnapshots((data ?? []) as SnapshotRow[])
          setLoadingSnapshots(false)
        })
    }
  }, [contact])

  // Debounced entreprise search
  const searchEntreprises = useCallback((query: string) => {
    if (query.trim().length < 2) {
      setEntrepriseResults([])
      return
    }
    setEntrepriseSearching(true)
    supabase
      .from('entreprises')
      .select('id, company_name')
      .ilike('company_name', `%${query.trim()}%`)
      .limit(8)
      .then(({ data }) => {
        setEntrepriseResults((data ?? []) as EntrepriseOption[])
        setEntrepriseSearching(false)
      })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchEntreprises(entrepriseSearch), 300)
    return () => clearTimeout(timer)
  }, [entrepriseSearch, searchEntreprises])

  if (!contact) return null

  // Best relation level from current state (including pending changes)
  const bestRelation = getBestRelation(relations, relationChanges)

  // Live scoring preview (no more tier)
  const previewScore = scoreContact({
    hierarchie: (hierarchie as Hierarchie) ?? null,
    persona: (persona as Persona) ?? null,
    niveauRelation: bestRelation,
    nbPersonnesDigiRelation: contact.nb_personnes_digi_relation,
  })

  const hasRelationChanges = Object.keys(relationChanges).length > 0
  const hasFieldChanges =
    position !== contact.position ||
    persona !== contact.persona ||
    hierarchie !== contact.hierarchie ||
    statut !== contact.statut_contact ||
    contactDigi !== contact.contact_digi ||
    ownerMembreId !== (contact.owner_membre_id ?? null) ||
    entrepriseId !== contact.entreprise_id
  const hasChanges = hasFieldChanges || hasRelationChanges

  async function handleSave() {
    if (!contact) return
    setSaving(true)

    // Save relation changes
    const relationPromises = Object.entries(relationChanges).map(([relationId, niveau]) =>
      supabase
        .from('contacts_membres_relations')
        .update({ niveau_de_relation: niveau })
        .eq('id', relationId)
    )

    // Save contact fields
    const contactPromise = supabase
      .from('contacts')
      .update({
        position: position || null,
        persona: persona || null,
        hierarchie: hierarchie || null,
        statut_contact: statut || null,
        contact_digi: contactDigi,
        owner_membre_id: ownerMembreId || null,
        entreprise_id: entrepriseId || null,
        scoring: previewScore.total,
      })
      .eq('id', contact.id)

    await Promise.all([contactPromise, ...relationPromises])

    // Auto-update entreprise status based on best contact status
    const resolvedEntrepriseId = entrepriseId || contact.entreprise_id
    if (resolvedEntrepriseId && statut) {
      await updateEntrepriseStatut(resolvedEntrepriseId)
    }

    setSaving(false)
    onSaved()
  }

  async function updateEntrepriseStatut(entId: string) {
    // Fetch all contacts of this entreprise to find the most advanced status
    const { data: allContacts } = await supabase
      .from('contacts')
      .select('statut_contact')
      .eq('entreprise_id', entId)

    if (!allContacts || allContacts.length === 0) return

    // Priority order (highest wins)
    const STATUT_PRIORITY: Record<string, { priority: number; entrepriseStatut: string }> = {
      'Client':         { priority: 4, entrepriseStatut: 'Devenu client Digileads' },
      'Intéressé':      { priority: 3, entrepriseStatut: 'Deal en cours' },
      'Contacté':       { priority: 2, entrepriseStatut: 'Activement démarché' },
      'À contacter':    { priority: 1, entrepriseStatut: 'À démarcher' },
    }

    let bestPriority = 0
    let bestEntrepriseStatut: string | null = null

    for (const c of allContacts) {
      const mapping = STATUT_PRIORITY[c.statut_contact as string]
      if (mapping && mapping.priority > bestPriority) {
        bestPriority = mapping.priority
        bestEntrepriseStatut = mapping.entrepriseStatut
      }
    }

    if (bestEntrepriseStatut) {
      await supabase
        .from('entreprises')
        .update({ statut_entreprise: bestEntrepriseStatut })
        .eq('id', entId)
    }
  }

  const scoreColor = previewScore.total >= 70 ? 'text-emerald-600' :
    previewScore.total >= 40 ? 'text-amber-600' : 'text-muted-foreground'

  return (
    <Drawer
      open={!!contact}
      onClose={onClose}
      title={`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Contact'}
      footer={
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="w-full"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Info header */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          {contact.company_name && (
            <p className="text-sm text-muted-foreground">{contact.company_name}</p>
          )}
          {contact.location && (
            <p className="text-sm text-muted-foreground">{contact.location}</p>
          )}
          {contact.email && (
            <p className="text-sm text-muted-foreground">{contact.email}</p>
          )}
          {contact.linkedin_url && (
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Voir sur LinkedIn <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Owner — admin only */}
        {adminMode && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Owner</h3>
          <FieldGroup label="Responsable du contact">
            <SelectField
              value={ownerMembreId}
              onChange={setOwnerMembreId}
              options={membres.map(m => ({ value: m.id, label: m.full_name }))}
              placeholder="Sélectionner un owner"
            />
          </FieldGroup>
        </div>
        )}

        {/* Entreprise linking — admin only */}
        {adminMode && <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Entreprise</h3>
          {entrepriseId && linkedEntrepriseName ? (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{linkedEntrepriseName}</span>
              <button
                type="button"
                onClick={() => { setEntrepriseId(null); setLinkedEntrepriseName(null) }}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Modifier
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={entrepriseSearch}
                  onChange={e => setEntrepriseSearch(e.target.value)}
                  placeholder="Rechercher une entreprise par nom..."
                  className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                {entrepriseSearching && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
              {entrepriseResults.length > 0 && (
                <div className="rounded-md border border-border bg-card max-h-40 overflow-auto">
                  {entrepriseResults.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        setEntrepriseId(e.id)
                        setLinkedEntrepriseName(e.company_name)
                        setEntrepriseSearch('')
                        setEntrepriseResults([])
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                    >
                      {e.company_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>}

        {/* Relations Digi — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setRelationsOpen(o => !o)}
            className="flex items-center justify-between w-full py-1"
          >
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Relations Digi ({relations.length})
            </h3>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${relationsOpen ? 'rotate-180' : ''}`} />
          </button>
          {relationsOpen && (
            <div className="mt-3">
              {loadingRelations ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : relations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune relation Digi.</p>
              ) : (
                <div className="space-y-2">
                  {relations.map(r => {
                    const currentLevel = relationChanges[r.id] ?? r.niveau_de_relation ?? 'Non renseigné'
                    const isOwner = r.membre_id === ownerMembreId
                    return (
                      <div key={r.id} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 min-w-[140px]">
                          {isOwner && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                          <span className={`text-sm truncate ${isOwner ? 'font-semibold' : ''}`}>
                            {r.membres_digilityx?.full_name ?? '—'}
                          </span>
                        </div>
                        <select
                          value={currentLevel}
                          onChange={e => setRelationChanges(prev => ({ ...prev, [r.id]: e.target.value }))}
                          className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          {NIVEAUX_RELATION.map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Score preview — admin only */}
        {adminMode && (
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider">Scoring</h3>
            <span className={`text-2xl font-bold ${scoreColor}`}>
              {previewScore.total}/100
            </span>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hiérarchie</span>
              <span className="font-medium">{previewScore.hierarchieScore}/30</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Persona</span>
              <span className="font-medium">{previewScore.personaScore}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Relation</span>
              <span className="font-medium">{previewScore.relationScore}/30</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nb relations Digi</span>
              <span className="font-medium">{previewScore.digiRelationScore}/20</span>
            </div>
          </div>
        </div>
        )}

        {/* Editable fields — admin only */}
        {adminMode && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Qualification</h3>

          <FieldGroup label="Poste">
            <TextField
              value={position ?? ''}
              onChange={(v) => setPosition(v || null)}
              placeholder="Ex: Directeur Marketing"
            />
          </FieldGroup>

          <FieldGroup label="Persona">
            <SelectField
              value={persona}
              onChange={setPersona}
              options={PERSONAS.map(p => ({ value: p, label: p }))}
            />
          </FieldGroup>

          <FieldGroup label="Hiérarchie">
            <SelectField
              value={hierarchie}
              onChange={setHierarchie}
              options={HIERARCHIES.map(h => ({ value: h, label: h }))}
            />
          </FieldGroup>

          <FieldGroup label="Statut">
            <SelectField
              value={statut}
              onChange={setStatut}
              options={STATUTS.map(s => ({ value: s, label: s }))}
            />
          </FieldGroup>

          <FieldGroup label="Contact Digi">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={contactDigi}
                onChange={e => setContactDigi(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm">Ce contact est un contact Digilityx</span>
            </label>
          </FieldGroup>
        </div>
        )}

        {/* Scraping history — admin only, collapsible */}
        {adminMode && (
        <div>
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="flex items-center justify-between w-full py-1"
          >
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              <History className="inline h-3.5 w-3.5 mr-1.5" />
              Historique scraping ({snapshots.length})
            </h3>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </button>
          {historyOpen && (
            <div className="mt-3">
              {loadingSnapshots ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun historique de scraping.</p>
              ) : (
                <div className="space-y-3">
                  {snapshots.map((snap, idx) => {
                    const prev = snapshots[idx + 1] ?? null
                    return (
                      <div key={snap.id} className="rounded-md border border-border p-3 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          {new Date(snap.scraped_at).toLocaleDateString('fr-FR', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                        <SnapshotField label="Poste" value={snap.position} prevValue={prev?.position} />
                        <SnapshotField label="Entreprise" value={snap.company_name} prevValue={prev?.company_name} />
                        <SnapshotField label="Lieu" value={snap.location} prevValue={prev?.location} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        )}

      </div>
    </Drawer>
  )
}

function SnapshotField({ label, value, prevValue }: { label: string; value: string | null; prevValue?: string | null }) {
  if (!value) return null
  const changed = prevValue !== undefined && prevValue !== value
  return (
    <div className={`text-sm ${changed ? 'bg-amber-50 dark:bg-amber-950/30 rounded px-1 -mx-1' : ''}`}>
      <span className="text-muted-foreground">{label}: </span>
      <span className={changed ? 'font-medium text-amber-700 dark:text-amber-400' : ''}>{value}</span>
      {changed && prevValue && (
        <span className="text-xs text-muted-foreground ml-1">(avant: {prevValue})</span>
      )}
    </div>
  )
}

/** Get the best relation level considering pending changes */
function getBestRelation(
  relations: RelationRow[],
  changes: Record<string, string>,
): NiveauRelation | null {
  if (relations.length === 0) return null

  const SCORES: Record<string, number> = {
    'Ami': 30,
    'Cercle familial': 20,
    'Ancien collègue': 20,
    'Alumni': 20,
    'Partenaire business': 20,
    'Connaissance': 5,
    'Inconnu': 0,
    'Non renseigné': 0,
  }

  let best: NiveauRelation | null = null
  let bestScore = -1

  for (const r of relations) {
    const level = (changes[r.id] ?? r.niveau_de_relation ?? 'Non renseigné') as NiveauRelation
    const score = SCORES[level] ?? 0
    if (score > bestScore) {
      bestScore = score
      best = level
    }
  }

  return best
}
