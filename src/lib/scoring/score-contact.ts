import type { Tier, Hierarchie, Persona, NiveauRelation } from '../types'

export interface ScoreInput {
  tier: Tier | null
  hierarchie: Hierarchie | null
  persona: Persona | null
  niveauRelation: NiveauRelation | null
  nbPersonnesDigiRelation: number
}

export interface ScoreBreakdown {
  total: number
  tierScore: number
  hierarchieScore: number
  personaScore: number
  relationScore: number
  digiRelationScore: number
}

function scoreTier(tier: Tier | null): number {
  switch (tier) {
    case 'Tier 1': return 40
    case 'Tier 2': return 25
    case 'Tier 3': return 10
    default: return 0
  }
}

function scoreHierarchie(hierarchie: Hierarchie | null): number {
  switch (hierarchie) {
    case 'COMEX': return 20
    case 'Directeur': return 15
    case 'Responsable': return 10
    case 'Opérationnel': return 5
    default: return 0
  }
}

function scorePersona(persona: Persona | null): number {
  if (!persona || persona === 'Hors expertise Digi') return 0
  return 15
}

function scoreRelation(niveau: NiveauRelation | null): number {
  switch (niveau) {
    case 'Ami': return 15
    case 'Cercle familial':
    case 'Ancien collègue':
    case 'Alumni':
    case 'Partenaire business': return 10
    case 'Connaissance': return 5
    default: return 0
  }
}

function scoreDigiRelation(nb: number): number {
  if (nb >= 3) return 10
  if (nb === 2) return 6
  if (nb === 1) return 3
  return 0
}

export function scoreContact(input: ScoreInput): ScoreBreakdown {
  const tierScore = scoreTier(input.tier)
  const hierarchieScore = scoreHierarchie(input.hierarchie)
  const personaScore = scorePersona(input.persona)
  const relationScore = scoreRelation(input.niveauRelation)
  const digiRelationScore = scoreDigiRelation(input.nbPersonnesDigiRelation)

  return {
    total: tierScore + hierarchieScore + personaScore + relationScore + digiRelationScore,
    tierScore,
    hierarchieScore,
    personaScore,
    relationScore,
    digiRelationScore,
  }
}
