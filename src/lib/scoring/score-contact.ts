import type { Hierarchie, Persona, NiveauRelation } from '../types'

export interface ScoreInput {
  hierarchie: Hierarchie | null
  persona: Persona | null
  niveauRelation: NiveauRelation | null
  nbPersonnesDigiRelation: number
}

export interface ScoreBreakdown {
  total: number
  hierarchieScore: number
  personaScore: number
  relationScore: number
  digiRelationScore: number
}

function scoreHierarchie(hierarchie: Hierarchie | null): number {
  switch (hierarchie) {
    case 'COMEX': return 30
    case 'Directeur': return 20
    case 'Manager': return 15
    case 'Opérationnel': return 5
    default: return 0
  }
}

function scorePersona(persona: Persona | null): number {
  if (!persona || persona === 'Hors expertise Digi') return 0
  return 20
}

function scoreRelation(niveau: NiveauRelation | null): number {
  switch (niveau) {
    case 'Ami': return 30
    case 'Cercle familial':
    case 'Ancien collègue':
    case 'Alumni':
    case 'Partenaire business': return 20
    case 'Connaissance': return 5
    default: return 0
  }
}

function scoreDigiRelation(nb: number): number {
  if (nb >= 3) return 20
  if (nb === 2) return 10
  if (nb === 1) return 5
  return 0
}

export function scoreContact(input: ScoreInput): ScoreBreakdown {
  const hierarchieScore = scoreHierarchie(input.hierarchie)
  const personaScore = scorePersona(input.persona)
  const relationScore = scoreRelation(input.niveauRelation)
  const digiRelationScore = scoreDigiRelation(input.nbPersonnesDigiRelation)

  return {
    total: hierarchieScore + personaScore + relationScore + digiRelationScore,
    hierarchieScore,
    personaScore,
    relationScore,
    digiRelationScore,
  }
}
