import type { CompanyTypology, SecteurDigi, IcpStatus, Tier } from '../types'

const SECTEURS_PRIORITAIRES: SecteurDigi[] = ['Pharma/Santé', 'BAF']
const TYPOLOGIES_HORS_TIER: CompanyTypology[] = ['TPE', 'Startup']

export interface TierResult {
  icp: IcpStatus
  tier: Tier
}

/**
 * Calcule automatiquement l'ICP et le Tier d'une entreprise
 * en fonction de sa typology et de son secteur.
 *
 * ICP = Non (→ Hors-Tier) :
 *  - Typology absente, TPE ou Startup
 *  - Secteur "Concurrent"
 *
 * ICP = Non spécifié (→ Tier 3) :
 *  - Typology éligible (Grand Groupe, ETI, PME) × Secteur absent
 *
 * ICP = Oui :
 *  - Tier 1 = Secteur prioritaire (Pharma/Santé, BAF)
 *  - Tier 2 = Autres secteurs
 */
export function computeTier(
  typology: CompanyTypology | null,
  secteur: SecteurDigi | null,
): TierResult {
  if (!typology || TYPOLOGIES_HORS_TIER.includes(typology) || secteur === 'Concurrent') {
    return { icp: 'Non', tier: 'Hors-Tier' }
  }

  if (!secteur) {
    return { icp: 'Non spécifié', tier: 'Tier 3' }
  }

  if (SECTEURS_PRIORITAIRES.includes(secteur)) {
    return { icp: 'Oui', tier: 'Tier 1' }
  }

  return { icp: 'Oui', tier: 'Tier 2' }
}
