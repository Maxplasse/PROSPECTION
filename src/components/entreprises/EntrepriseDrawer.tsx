import { useState, useEffect } from 'react'
import { ExternalLink, Save, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Drawer, FieldGroup, SelectField } from '@/components/ui/drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSupabaseQuery } from '@/lib/hooks/use-supabase'
import type {
  Entreprise, Tier, StatutEntreprise, SecteurDigi,
} from '@/lib/types'

const TIERS: Tier[] = ['Tier 1', 'Tier 2', 'Tier 3', 'Hors-Tier']
const STATUTS: StatutEntreprise[] = [
  'Qualifiée', 'A démarcher', 'En cours',
  'Bon Vivant', 'Actuellement client', 'Deal en cours',
]
const SECTEURS: SecteurDigi[] = [
  'Pharma/Santé', 'Tech', 'Service B2B', 'Education',
  'Transports/Logistique', 'BAF', 'e-commerce', 'Service',
  'Immobilier', 'Tourisme/Loisir', 'Grande distribution', 'Luxe', 'Recrutement',
]

interface MembreOption { id: string; full_name: string }

interface Props {
  entreprise: Entreprise | null
  onClose: () => void
  onSaved: () => void
}

export function EntrepriseDrawer({ entreprise, onClose, onSaved }: Props) {
  const [tier, setTier] = useState<string | null>(null)
  const [statut, setStatut] = useState<string | null>(null)
  const [secteur, setSecteur] = useState<string | null>(null)
  const [owner, setOwner] = useState<string | null>(null)
  const [accountManager, setAccountManager] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: membres } = useSupabaseQuery<MembreOption[]>(
    () => supabase.from('membres_digilityx').select('id, full_name').order('full_name')
  )

  useEffect(() => {
    if (entreprise) {
      setTier(entreprise.tier)
      setStatut(entreprise.statut_entreprise)
      setSecteur(entreprise.secteur_digi)
      setOwner(entreprise.owner)
      setAccountManager(entreprise.account_manager_id)
    }
  }, [entreprise])

  if (!entreprise) return null

  const hasChanges =
    tier !== entreprise.tier ||
    statut !== entreprise.statut_entreprise ||
    secteur !== entreprise.secteur_digi ||
    owner !== entreprise.owner ||
    accountManager !== entreprise.account_manager_id

  async function handleSave() {
    if (!entreprise) return
    setSaving(true)
    await supabase
      .from('entreprises')
      .update({
        tier: tier || null,
        statut_entreprise: statut || null,
        secteur_digi: secteur || null,
        owner: owner || null,
        account_manager_id: accountManager || null,
      })
      .eq('id', entreprise.id)
    setSaving(false)
    onSaved()
  }

  const membreOptions = (membres ?? []).map(m => ({ value: m.id, label: m.full_name }))

  return (
    <Drawer open={!!entreprise} onClose={onClose} title={entreprise.company_name}>
      <div className="space-y-6">
        {/* Info header */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {entreprise.company_typology && (
              <Badge variant="secondary">{entreprise.company_typology}</Badge>
            )}
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
          {entreprise.scoring_icp > 0 && (
            <p className="text-sm font-medium">Score ICP : {entreprise.scoring_icp}/100</p>
          )}
          {entreprise.justification && (
            <p className="text-sm text-muted-foreground italic">{entreprise.justification}</p>
          )}
        </div>

        {/* Editable fields */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Qualification</h3>

          <FieldGroup label="Tier">
            <SelectField
              value={tier}
              onChange={setTier}
              options={TIERS.map(t => ({ value: t, label: t }))}
            />
          </FieldGroup>

          <FieldGroup label="Statut">
            <SelectField
              value={statut}
              onChange={setStatut}
              options={STATUTS.map(s => ({ value: s, label: s }))}
            />
          </FieldGroup>

          <FieldGroup label="Secteur Digi">
            <SelectField
              value={secteur}
              onChange={setSecteur}
              options={SECTEURS.map(s => ({ value: s, label: s }))}
            />
          </FieldGroup>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Responsables</h3>

          <FieldGroup label="Owner">
            <SelectField
              value={owner}
              onChange={setOwner}
              options={membreOptions}
              placeholder="— Aucun owner —"
            />
          </FieldGroup>

          <FieldGroup label="Account Manager">
            <SelectField
              value={accountManager}
              onChange={setAccountManager}
              options={membreOptions}
              placeholder="— Aucun AM —"
            />
          </FieldGroup>
        </div>

        {/* Save button */}
        <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t border-border -mx-6 px-6">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="w-full"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Enregistrer
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
