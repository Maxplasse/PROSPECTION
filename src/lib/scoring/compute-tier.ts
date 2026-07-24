import type { CompanyTypology, SecteurDigi, IcpStatus, Tier } from '../types'

const SECTEURS_PRIORITAIRES: SecteurDigi[] = ['Pharma/Santé', 'BAF']
const TYPOLOGIES_HORS_TIER: CompanyTypology[] = ['TPE', 'Startup']

/**
 * Dérive la typology depuis un effectif exact.
 * Seuils : Grand Groupe >= 5000, ETI >= 250, PME >= 10, TPE >= 1.
 */
export function deriveTypologyFromCount(count: number): CompanyTypology | null {
  if (!count) return null
  if (count >= 5000) return 'Grand Groupe'
  if (count >= 250) return 'ETI'
  if (count >= 10) return 'PME'
  return 'TPE'
}

/**
 * Dérive la typology depuis un range textuel quand l'effectif exact est absent.
 * Formats supportés : "X-Y", "X - Y", "X 000 - Y 999", "X+" (ex: 10001+).
 * Pour X-Y : utilise la médiane (X+Y)/2.
 * Pour X+  : utilise X directement.
 * Équivalent SQL dans update_secteur_digi_missing.sql.
 */
export function deriveTypologyFromRange(range: string | null): CompanyTypology | null {
  if (!range || range === 'null') return null
  const clean = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10)

  let value: number
  if (range.includes('+')) {
    value = clean(range)
  } else {
    const parts = range.split('-')
    if (parts.length < 2) return null
    const lo = clean(parts[0])
    const hi = clean(parts[1])
    if (isNaN(lo) || isNaN(hi)) return null
    value = Math.floor((lo + hi) / 2)
  }

  return deriveTypologyFromCount(value)
}

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
