import { useState, useEffect, useRef } from 'react'
import { ExternalLink, Save, Loader2, X, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Drawer, FieldGroup, SelectField } from '@/components/ui/drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSupabaseQuery } from '@/lib/hooks/use-supabase'
import { computeTier } from '@/lib/scoring/compute-tier'
import type {
  Entreprise, StatutEntreprise, StatutDigi, SecteurDigi, CompanyTypology,
} from '@/lib/types'

const TYPOLOGIES: CompanyTypology[] = ['Grand Groupe', 'ETI', 'PME', 'TPE', 'Startup']
const STATUTS: StatutEntreprise[] = [
  'À démarcher', 'Activement démarché', 'Deal en cours', 'Devenu client Digileads',
]
const STATUTS_DIGI: StatutDigi[] = [
  'Client Digi - pas de mission', 'Client Digi - mission en cours',
  'Pas client Digi', 'Client Digileads',
]
const SECTEURS: SecteurDigi[] = [
  'Pharma/Santé', 'Tech', 'Service B2B', 'Education',
  'Transports/Logistique', 'BAF', 'e-commerce', 'Service',
  'Immobilier', 'Tourisme/Loisir', 'Grande distribution', 'Luxe', 'Recrutement',
  'Non spécifié', 'Concurrent',
]

interface MembreOption { id: string; full_name: string }
interface EntrepriseOption { id: string; company_name: string }

interface Props {
  entreprise: Entreprise | null
  onClose: () => void
  onSaved: () => void
}

export function EntrepriseDrawer({ entreprise, onClose, onSaved }: Props) {
  const [typology, setTypology] = useState<string | null>(null)
  const [statut, setStatut] = useState<string | null>(null)
  const [secteur, setSecteur] = useState<string | null>(null)
  const [accountManager, setAccountManager] = useState<string | null>(null)
  const [parentCompanyId, setParentCompanyId] = useState<string | null>(null)
  const [parentCompanyName, setParentCompanyName] = useState<string | null>(null)
  const [isParentEntity, setIsParentEntity] = useState(false)
  const [statutDigi, setStatutDigi] = useState<string | null>(null)
  const [sourceAcquisition, setSourceAcquisition] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Search parent company
  const [parentSearch, setParentSearch] = useState('')
  const [parentResults, setParentResults] = useState<EntrepriseOption[]>([])
  const [showParentResults, setShowParentResults] = useState(false)
  const parentSearchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (parentSearch.trim().length < 2) { setParentResults([]); return }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('entreprises')
        .select('id, company_name')
        .ilike('company_name', `%${parentSearch.trim()}%`)
        .neq('id', entreprise?.id ?? '')
        .order('company_name')
        .limit(10)
      setParentResults(data ?? [])
      setShowParentResults(true)
    }, 300)
    return () => clearTimeout(timeout)
  }, [parentSearch, entreprise?.id])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (parentSearchRef.current && !parentSearchRef.current.contains(e.target as Node)) {
        setShowParentResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const { data: membres } = useSupabaseQuery<MembreOption[]>(
    () => supabase.from('membres_digilityx').select('id, full_name').order('full_name')
  )

  // Auto-compute tier from typology + secteur
  const computed = computeTier(
    typology as CompanyTypology | null,
    secteur as SecteurDigi | null,
  )

  useEffect(() => {
    if (entreprise) {
      setTypology(entreprise.company_typology)
      setStatut(entreprise.statut_entreprise)
      setStatutDigi(entreprise.statut_digi)
      setSecteur(entreprise.secteur_digi)
      setAccountManager(entreprise.account_manager_id)
      setParentCompanyId(entreprise.parent_company_id)
      setIsParentEntity(entreprise.is_parent_entity)
      setSourceAcquisition(entreprise.source_acquisition)
      setParentSearch('')
      setParentCompanyName(null)
      // Fetch parent name if exists
      if (entreprise.parent_company_id) {
        supabase
          .from('entreprises')
          .select('company_name')
          .eq('id', entreprise.parent_company_id)
          .single()
          .then(({ data }) => { if (data) setParentCompanyName(data.company_name) })
      }
    }
  }, [entreprise])

  if (!entreprise) return null

  const hasChanges =
    typology !== entreprise.company_typology ||
    statut !== entreprise.statut_entreprise ||
    statutDigi !== entreprise.statut_digi ||
    secteur !== entreprise.secteur_digi ||
    accountManager !== entreprise.account_manager_id ||
    parentCompanyId !== entreprise.parent_company_id ||
    isParentEntity !== entreprise.is_parent_entity ||
    sourceAcquisition !== entreprise.source_acquisition

  async function handleSave() {
    if (!entreprise) return
    setSaving(true)
    await supabase
      .from('entreprises')
      .update({
        company_typology: typology || null,
        tier: computed.tier,
        icp: computed.icp === 'Oui',
        secteur_digi: secteur || null,
        statut_entreprise: statut || null,
        statut_digi: statutDigi || null,
        account_manager_id: accountManager || null,
        parent_company_id: parentCompanyId || null,
        is_subsidiary: !!parentCompanyId,
        is_parent_entity: isParentEntity,
        source_acquisition: sourceAcquisition || null,
      })
      .eq('id', entreprise.id)
    setSaving(false)
    onSaved()
  }

  const membreOptions = (membres ?? []).map(m => ({ value: m.id, label: m.full_name }))

  return (
    <Drawer
      open={!!entreprise}
      onClose={onClose}
      title={entreprise.company_name}
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
          <div className="flex items-center gap-2 flex-wrap">
            {entreprise.company_employee_count && (
              <span className="text-sm text-muted-foreground">
                {entreprise.company_employee_count.toLocaleString('fr-FR')} employés
              </span>
            )}
          </div>
          {entreprise.company_location && (
            <p className="text-sm text-muted-foreground">{entreprise.company_location}</p>
          )}
          {entreprise.linkedin_industry && (
            <p className="text-sm text-muted-foreground">
              LinkedIn : {entreprise.linkedin_industry}
            </p>
          )}
          {entreprise.company_id_linkedin && (
            <a
              href={`https://www.linkedin.com/company/${entreprise.company_id_linkedin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Voir sur LinkedIn <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {entreprise.justification && (
            <p className="text-sm text-muted-foreground italic">{entreprise.justification}</p>
          )}
        </div>

        {/* Editable fields */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Qualification</h3>

          <FieldGroup label="Typology">
            <SelectField
              value={typology}
              onChange={setTypology}
              options={TYPOLOGIES.map(t => ({ value: t, label: t }))}
              placeholder="— Non renseigné —"
            />
          </FieldGroup>

          <FieldGroup label="Secteur Digi">
            <SelectField
              value={secteur}
              onChange={setSecteur}
              options={SECTEURS.map(s => ({ value: s, label: s }))}
            />
          </FieldGroup>

          {/* Auto-computed ICP + Tier */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ICP</span>
              <Badge variant={computed.icp === 'Oui' ? 'default' : computed.icp === 'Non spécifié' ? 'secondary' : 'outline'}>
                {computed.icp}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tier</span>
              <Badge variant={computed.tier === 'Tier 1' ? 'default' : computed.tier === 'Tier 2' ? 'secondary' : 'outline'}>
                {computed.tier}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground italic">Calculé automatiquement depuis Typology + Secteur</p>
          </div>

          <FieldGroup label="Statut">
            <SelectField
              value={statut}
              onChange={setStatut}
              options={STATUTS.map(s => ({ value: s, label: s }))}
            />
          </FieldGroup>

          <FieldGroup label="Statut DIGI">
            <SelectField
              value={statutDigi}
              onChange={setStatutDigi}
              options={STATUTS_DIGI.map(s => ({ value: s, label: s }))}
              placeholder="— Non renseigné —"
            />
          </FieldGroup>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Responsable</h3>

          <FieldGroup label="Account Manager">
            <SelectField
              value={accountManager}
              onChange={setAccountManager}
              options={membreOptions}
              placeholder="— Aucun AM —"
            />
          </FieldGroup>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Structure</h3>

          <FieldGroup label="Entité mère">
            {parentCompanyId ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-sm flex-1 truncate">{parentCompanyName ?? parentCompanyId}</span>
                <button
                  type="button"
                  onClick={() => { setParentCompanyId(null); setParentCompanyName(null) }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div ref={parentSearchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={parentSearch}
                    onChange={e => setParentSearch(e.target.value)}
                    onFocus={() => parentResults.length > 0 && setShowParentResults(true)}
                    placeholder="Rechercher une entreprise mère..."
                    className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
                {showParentResults && parentResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
                    {parentResults.map(e => (
                      <button
                        key={e.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          setParentCompanyId(e.id)
                          setParentCompanyName(e.company_name)
                          setParentSearch('')
                          setShowParentResults(false)
                        }}
                      >
                        {e.company_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FieldGroup>

          <FieldGroup label="Entité mère (groupe)">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isParentEntity}
                onChange={e => setIsParentEntity(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm">Cette entreprise est une entité mère</span>
            </label>
          </FieldGroup>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Acquisition</h3>
          <FieldGroup label="Source d'acquisition">
            <SelectField
              value={sourceAcquisition}
              onChange={setSourceAcquisition}
              options={[
                { value: 'Prospection', label: 'Prospection' },
                { value: 'Inbound', label: 'Inbound' },
                { value: 'Réseau', label: 'Réseau' },
                { value: 'Autre', label: 'Autre' },
              ]}
              placeholder="— Non renseigné —"
            />
          </FieldGroup>
        </div>

      </div>
    </Drawer>
  )
}
