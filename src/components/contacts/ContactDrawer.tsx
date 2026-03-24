import { useState, useEffect } from 'react'
import { ExternalLink, Save, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Drawer, FieldGroup, SelectField } from '@/components/ui/drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scoreContact } from '@/lib/scoring/score-contact'
import type {
  Persona, Hierarchie, Priorite, StatutContact, NiveauRelation,
} from '@/lib/types'

const PERSONAS: Persona[] = [
  'Dirigeant', 'Marketing', 'Produit', 'Design', 'Commercial', 'Hors expertise Digi',
]
const HIERARCHIES: Hierarchie[] = ['COMEX', 'Directeur', 'Responsable', 'Opérationnel']
const PRIORITES: Priorite[] = ['Priorité 1', 'Priorité 2', 'Priorité 3']
const STATUTS: StatutContact[] = [
  'A contacter', 'A surveiller', 'En Discussion',
  'Bon Vivant', 'Pas intéressant', 'A relancer',
]
// Relations are managed via contacts_membres_relations table, not directly editable here

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
  priorite: string | null
  statut_contact: string | null
  niveau_de_relation: string | null
  scoring: number
  nb_personnes_digi_relation: number
  contact_digi: boolean
  entreprise_id: string | null
}

interface Props {
  contact: ContactRow | null
  onClose: () => void
  onSaved: () => void
  entrepriseTier?: string | null
}

export function ContactDrawer({ contact, onClose, onSaved, entrepriseTier }: Props) {
  const [persona, setPersona] = useState<string | null>(null)
  const [hierarchie, setHierarchie] = useState<string | null>(null)
  const [priorite, setPriorite] = useState<string | null>(null)
  const [statut, setStatut] = useState<string | null>(null)
  const [contactDigi, setContactDigi] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (contact) {
      setPersona(contact.persona)
      setHierarchie(contact.hierarchie)
      setPriorite(contact.priorite)
      setStatut(contact.statut_contact)
      setContactDigi(contact.contact_digi)
    }
  }, [contact])

  if (!contact) return null

  // Live scoring preview
  const previewScore = scoreContact({
    tier: (entrepriseTier as 'Tier 1') ?? null,
    hierarchie: (hierarchie as Hierarchie) ?? null,
    persona: (persona as Persona) ?? null,
    niveauRelation: (contact.niveau_de_relation as NiveauRelation) ?? null,
    nbPersonnesDigiRelation: contact.nb_personnes_digi_relation,
  })

  const hasChanges =
    persona !== contact.persona ||
    hierarchie !== contact.hierarchie ||
    priorite !== contact.priorite ||
    statut !== contact.statut_contact ||
    contactDigi !== contact.contact_digi

  async function handleSave() {
    if (!contact) return
    setSaving(true)
    await supabase
      .from('contacts')
      .update({
        persona: persona || null,
        hierarchie: hierarchie || null,
        priorite: priorite || null,
        statut_contact: statut || null,
        contact_digi: contactDigi,
        scoring: previewScore.total,
      })
      .eq('id', contact.id)
    setSaving(false)
    onSaved()
  }

  const scoreColor = previewScore.total >= 70 ? 'text-emerald-600' :
    previewScore.total >= 40 ? 'text-amber-600' : 'text-muted-foreground'

  return (
    <Drawer
      open={!!contact}
      onClose={onClose}
      title={`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Contact'}
    >
      <div className="space-y-6">
        {/* Info header */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          {contact.position && (
            <p className="text-sm font-medium">{contact.position}</p>
          )}
          {contact.company_name && (
            <p className="text-sm text-muted-foreground">{contact.company_name}</p>
          )}
          {contact.location && (
            <p className="text-sm text-muted-foreground">{contact.location}</p>
          )}
          {contact.email && (
            <p className="text-sm text-muted-foreground">{contact.email}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">
              {contact.nb_personnes_digi_relation} relation{contact.nb_personnes_digi_relation > 1 ? 's' : ''} Digi
            </Badge>
            {contact.niveau_de_relation && (
              <Badge variant="secondary">{contact.niveau_de_relation}</Badge>
            )}
          </div>
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

        {/* Score preview */}
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider">Scoring</h3>
            <span className={`text-2xl font-bold ${scoreColor}`}>
              {previewScore.total}/100
            </span>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tier entreprise</span>
              <span className="font-medium">{previewScore.tierScore}/40</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hiérarchie</span>
              <span className="font-medium">{previewScore.hierarchieScore}/20</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Persona</span>
              <span className="font-medium">{previewScore.personaScore}/15</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Relation</span>
              <span className="font-medium">{previewScore.relationScore}/15</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nb relations Digi</span>
              <span className="font-medium">{previewScore.digiRelationScore}/10</span>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Qualification</h3>

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

          <FieldGroup label="Priorité">
            <SelectField
              value={priorite}
              onChange={setPriorite}
              options={PRIORITES.map(p => ({ value: p, label: p }))}
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
