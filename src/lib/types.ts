export type Tier = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Hors-Tier'

export type StatutEntreprise =
  | 'Qualifiée'
  | 'A démarcher'
  | 'En cours'
  | 'Actuellement client'
  | 'Deal en cours'

export type Persona =
  | 'Dirigeant'
  | 'Marketing'
  | 'Produit'
  | 'Design'
  | 'Hors expertise Digi'

export type Hierarchie = 'COMEX' | 'Directeur' | 'Manager' | 'Opérationnel'

export type StatutContact =
  | 'À contacter'
  | 'Contacté'
  | 'Intéressé'
  | 'Pas intéressé'
  | 'En attente'
  | 'Déjà client'

export type NiveauRelation =
  | 'Ami'
  | 'Cercle familial'
  | 'Ancien collègue'
  | 'Alumni'
  | 'Partenaire business'
  | 'Connaissance'
  | 'Inconnu'

export type StatutNotification = 'Envoyée' | 'Lue' | 'En attente'

export type NotificationType =
  | 'scoring_alert'
  | 'job_change'
  | 'new_contact'
  | 'qualification_change'
  | 'activity_detected'

export type MembreRole = 'membre' | 'account_manager' | 'admin'

export type ActivityType =
  | 'post'
  | 'article'
  | 'comment'
  | 'reaction'
  | 'share'
  | 'job_change'
  | 'profile_update'
  | 'connection'

export type PositionSource = 'phantombuster' | 'manual' | 'import' | 'linkedin_api'

export type QualificationSource = 'manual' | 'llm' | 'phantombuster' | 'import' | 'trigger'

export type EntityType = 'contact' | 'entreprise'

export type CompanyTypology = 'Grand Groupe' | 'ETI' | 'PME' | 'TPE' | 'Startup'

export type SecteurDigi =
  | 'Pharma/Santé'
  | 'Tech'
  | 'Service B2B'
  | 'Education'
  | 'Transports/Logistique'
  | 'BAF'
  | 'e-commerce'
  | 'Service'
  | 'Immobilier'
  | 'Tourisme/Loisir'
  | 'Grande distribution'
  | 'Luxe'
  | 'Recrutement'
  | 'Non spécifié'
  | 'Concurrent'

export type IcpStatus = 'Oui' | 'Non' | 'Non spécifié'

export interface Entreprise {
  id: string
  company_name: string
  company_website: string | null
  company_domain: string | null
  company_id_linkedin: string | null
  company_employee_count: number | null
  company_employee_range: string | null
  company_location: string | null
  company_typology: CompanyTypology | null
  secteur_digi: SecteurDigi | null
  icp: boolean
  scoring_icp: number
  justification: string | null
  linkedin_industry: string | null
  owner: string | null
  account_manager_id: string | null
  parent_company_id: string | null
  is_subsidiary: boolean
  is_parent_entity: boolean
  company_website_from_linkedin: string | null
  company_description: string | null
  company_specialties: string | null
  tier: Tier | null
  statut_entreprise: StatutEntreprise | null
  is_digi_client: boolean
  source_acquisition: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  linkedin_url: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  position: string | null
  email: string | null
  location: string | null
  company_name: string | null
  company_id_linkedin: string | null
  entreprise_id: string | null
  years_in_position: number | null
  months_in_position: number | null
  years_in_company: number | null
  months_in_company: number | null
  id_url_linkedin: string | null
  summary: string | null
  title_description: string | null
  connection_degree: string | null
  is_premium: boolean
  is_open_link: boolean
  shared_connections_count: number
  profile_image_url: string | null
  default_profile_url: string | null
  last_scraped_at: string | null
  persona: Persona | null
  hierarchie: Hierarchie | null
  contact_digi: boolean
  statut_contact: StatutContact | null
  /** CACHED — maintained by trigger from contacts_membres_relations */
  niveau_de_relation: NiveauRelation | null
  scoring: number
  /** CACHED — maintained by trigger from contacts_membres_relations */
  nb_personnes_digi_relation: number
  owner_membre_id: string | null
  query: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  description_notification: string | null
  scoring_notification: number | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  position: string | null
  company_name: string | null
  statut_notification: StatutNotification | null
  notification_type: NotificationType | null
  contact_id: string | null
  entreprise_id: string | null
  slack_message_ts: string | null
  created_at: string
}

export interface MembreDigilityx {
  id: string
  first_name: string
  last_name: string
  full_name: string
  role: MembreRole
  email: string | null
  consent: boolean
  created_at: string
}

export interface ContactMembreRelation {
  id: string
  contact_id: string
  membre_id: string
  niveau_de_relation: NiveauRelation | null
  connection_degree: '1st' | '2nd' | '3rd' | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ContactPositionHistory {
  id: string
  contact_id: string
  entreprise_id: string | null
  company_name: string | null
  position: string | null
  started_at: string | null
  ended_at: string | null
  is_current: boolean
  source: PositionSource | null
  detected_at: string
  created_at: string
}

export interface LinkedinActivity {
  id: string
  contact_id: string
  activity_type: ActivityType
  content: string | null
  linkedin_post_url: string | null
  scraped_at: string | null
  raw_data: Record<string, unknown> | null
  phantombuster_run_id: string | null
  created_at: string
}

export interface QualificationLog {
  id: string
  entity_type: EntityType
  entity_id: string
  field_changed: string | null
  old_value: string | null
  new_value: string | null
  source: QualificationSource | null
  metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
}

export interface ScrapingSnapshot {
  id: string
  contact_id: string
  scraped_at: string
  position: string | null
  company_name: string | null
  company_id_linkedin: string | null
  location: string | null
  summary: string | null
  title_description: string | null
  connection_degree: string | null
  is_premium: boolean | null
  shared_connections_count: number | null
  profile_image_url: string | null
  raw_data: Record<string, unknown> | null
  created_at: string
}
