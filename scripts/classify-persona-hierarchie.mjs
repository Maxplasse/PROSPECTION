/**
 * Classification automatique de la hiérarchie et du persona des contacts
 * à partir de leur intitulé de poste (position).
 *
 * Usage :
 *   node scripts/classify-persona-hierarchie.mjs --membre=<uuid>        (dry-run Tier 1)
 *   node scripts/classify-persona-hierarchie.mjs --membre=<uuid> --apply (applique en base)
 *   node scripts/classify-persona-hierarchie.mjs --all --apply           (tous les membres, Tier 1)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// ─────────────────────────────────────────────
// RÈGLES DE CLASSIFICATION — HIÉRARCHIE
// ─────────────────────────────────────────────
export function getHierarchie(pos) {
  const p = pos.toLowerCase()

  // Stagiaire / Alternant — priorité absolue → 0 pt de hiérarchie
  if (/\b(stagiaire|alternant|alternante|alternance|apprenti|apprentie|intern\b|stage\b)/.test(p))
    return 'Stagiaire/Alternant'

  // Exclusions Manager
  const isJuniorManager = /\bjunior\b.*\bmanager\b/.test(p)
  const isOfficeManager  = /\boffice manager\b/.test(p)

  // Partner : exclure les "X Business Partner" fonctionnels
  const isBadPartner = /\b(business|people|hr|hrbp|data|digital|sales|marketing|talent|it|technology|medical|scientific|client|customer|intelligence|finance|financial|strategic|innovation|delivery|journey)\s+(intelligence\s+)?partner\b/.test(p)
  const isPartnerManager = /\bpartner\s+manager\b/.test(p)
  const isGoodPartner = /\bpartner\b/.test(p) && !isBadPartner && !isPartnerManager

  // Product Owner / Solution Owner → ne pas confondre avec "owner" COMEX
  const isProductOwner = /\bproduct\s+owner\b|\bsolution\s+owner\b|\bhcm\s+solution\s+owner\b/.test(p)

  // COMEX
  if (
    /\bchief\b/.test(p) ||
    /\b(ceo|cto|cfo|cmo|coo|cpo|cdo|ciso|cro|cso|chro|cio)\b/.test(p) ||
    /\b(pdg|daf|drh|dsi|dg)\b/.test(p) ||
    /\bpr[eé]sident(e)?\b/.test(p) || /\bpresident\b/.test(p) ||
    /\b(founder|co[- ]?founder|cofondateur|cofondatrice|fondateur|fondatrice)\b/.test(p) ||
    /\bmanaging (director|partner)\b/.test(p) ||
    /\bgeneral manager\b/.test(p) ||
    /\bdirecteur(rice)?\s+g[eé]n[eé]ral(e)?\b/.test(p) ||
    /\bvice[- ]?pr[eé]sident/.test(p) ||
    /\b(evp|svp|vp)\b/.test(p) ||
    (!isProductOwner && /\b(actionnaire|propriétaire|owner)\b/.test(p)) ||
    /\bangel investor\b/.test(p) ||
    /\bacting ceo\b/.test(p) ||
    /\bassoci[ée](e)?\b/.test(p) ||
    /\bg[eé]rant(e)?\b/.test(p) ||
    /\bco-?head\b/.test(p) ||
    isGoodPartner
  ) return 'COMEX'

  // Directeur
  if (
    /\bdirecteur\b/.test(p) || /\bdirectrice\b/.test(p) || /\bdirector\b/.test(p) ||
    /\bhead of\b/.test(p) ||
    /\bassociate director\b/.test(p) ||
    /\bprincipal\b/.test(p)
  ) return 'Directeur'

  // Manager
  if (!isJuniorManager && !isOfficeManager && (
    /\bresponsable\b/.test(p) ||
    /\bmanager\b/.test(p) ||
    /\blead\b/.test(p)
  )) return 'Manager'

  return 'Opérationnel'
}

// ─────────────────────────────────────────────
// RÈGLES DE CLASSIFICATION — PERSONA
// ─────────────────────────────────────────────
export function getPersona(pos, hier) {
  const p = pos.toLowerCase()

  // RH / Human Resources → toujours Hors expertise Digi (fix: Chief HR, Chargée dev RH)
  if (
    /\b(ressources\s+humaines|human\s+resources|chief\s+people|people\s+officer|chief\s+hr)\b/.test(p) ||
    /\b(chro|drh)\b/.test(p)
  ) return 'Hors expertise Digi'

  // Acheteur / Achats
  if (/\b(acheteur|acheteuse)\b/.test(p)) {
    if (/\b(prestations? intellectuelles?|communication|marketing|digital|conseil|informatique|it\b|service)/.test(p))
      return 'Acheteur'
    return 'Hors expertise Digi'
  }
  // Responsable/Directeur Achats (indirects, groupe…) → Acheteur
  if (/\bachats?\b/.test(p)) return 'Acheteur'

  // Design
  if (/\b(design(er)?|ux\b|ui\b|graphi|motion|art director|expérience utilisateur|illustrat)/.test(p))
    return 'Design'

  // Marketing (hors Talent Acquisition)
  const isTalentAcquisition = /\btalent\s+acquisition\b/.test(p)
  if (!isTalentAcquisition && (
    /\b(marketing|webmarketing|brand|content|growth|seo|sea|crm|acquisition|influence|social media|community|e[-]?reputation|media|médias|analyste web|web analyst|web analytics|e.?commerce|ecommerce|e.?store|amazon|expérience client|customer experience|customer engagement)/.test(p)
  )) return 'Marketing'

  // Commercial — avant Produit pour éviter que "développement" parte dans Produit
  if (
    /\b(commercial|sales|account|business develop|bizdev|vente|revenue|customer success|key account|partenariat|partnership|pre[- ]?sales|avant[- ]?vente)/.test(p) ||
    /\bdéveloppement\s+(international|commercial|des\s+affaires|d['']affaires|business)\b/.test(p)
  ) return 'Commercial'

  // Produit
  if (
    /\b(product|produit|scrum|agile|digital|transformation|data|architect|tech|devops|innovation|numérique|software|développe|ingénieur|infrastructure|cloud|erp|si\b|ai expert|ai officer|ai specialist|intelligence artificielle|\bweb\b)/.test(p) ||
    /\bdigitau?x\b/.test(p)
  ) return 'Produit'

  // Dirigeant = COMEX sans domaine fonctionnel identifiable
  if (hier === 'COMEX') return 'Dirigeant'

  return 'Hors expertise Digi'
}

// ─────────────────────────────────────────────
// LOGIQUE PRINCIPALE
// ─────────────────────────────────────────────
async function getTier1EntrepriseIds() {
  let ids = new Set()
  let from = 0
  while (true) {
    const { data, error } = await sb.from('entreprises').select('id').eq('tier', 'Tier 1').range(from, from + 999)
    if (error || !data.length) break
    data.forEach(e => ids.add(e.id))
    if (data.length < 1000) break
    from += 1000
  }
  return ids
}

async function getContactsForMembre(membreId, tier1Ids) {
  let all = [], from = 0
  while (true) {
    const r = await sb.from('contacts_membres_relations')
      .select('contacts(id, position, hierarchie, persona, entreprise_id)')
      .eq('membre_id', membreId)
      .not('contacts.position', 'is', null)
      .range(from, from + 999)
    if (r.error || !r.data.length) break
    all.push(...r.data.filter(d => d.contacts).map(d => d.contacts))
    if (r.data.length < 1000) break
    from += 1000
  }
  return all.filter(c => tier1Ids.has(c.entreprise_id))
}

async function run() {
  const args = process.argv.slice(2)
  const membreArg = args.find(a => a.startsWith('--membre='))?.split('=')[1]
  const applyMode = args.includes('--apply')
  const allMode   = args.includes('--all')

  if (!membreArg && !allMode) {
    console.error('Usage: node classify-persona-hierarchie.mjs --membre=<uuid> [--apply]')
    console.error('       node classify-persona-hierarchie.mjs --all [--apply]')
    process.exit(1)
  }

  console.log(applyMode ? '🚀 Mode APPLY' : '👁  Mode DRY-RUN (--apply pour appliquer)')

  const tier1Ids = await getTier1EntrepriseIds()
  console.log(`Entreprises Tier 1 : ${tier1Ids.size}`)

  // Récupère la liste des membres à traiter
  let membreIds = []
  if (allMode) {
    const { data } = await sb.from('membres_digilityx').select('id, full_name')
    membreIds = data
  } else {
    const { data } = await sb.from('membres_digilityx').select('id, full_name').eq('id', membreArg)
    membreIds = data
  }

  let totalChanges = 0

  for (const membre of membreIds) {
    const contacts = await getContactsForMembre(membre.id, tier1Ids)
    const toUpdate = []

    for (const c of contacts) {
      const hier    = getHierarchie(c.position)
      const persona = getPersona(c.position, hier)
      if (hier !== c.hierarchie || persona !== c.persona) {
        toUpdate.push({ id: c.id, position: c.position, hierarchie: hier, persona })
      }
    }

    console.log(`\n${membre.full_name} — ${contacts.length} contacts Tier 1, ${toUpdate.length} à mettre à jour`)

    for (const row of toUpdate) {
      console.log(`  "${row.position}" → ${row.hierarchie} / ${row.persona}`)
    }

    if (applyMode && toUpdate.length > 0) {
      const chunkSize = 50
      for (let i = 0; i < toUpdate.length; i += chunkSize) {
        const chunk = toUpdate.slice(i, i + chunkSize)
        for (const row of chunk) {
          const { error } = await sb.from('contacts')
            .update({ hierarchie: row.hierarchie, persona: row.persona })
            .eq('id', row.id)
          if (error) console.error(`  ❌ Erreur sur ${row.position}:`, error.message)
        }
      }
      console.log(`  ✅ ${toUpdate.length} contacts mis à jour`)
    }

    totalChanges += toUpdate.length
  }

  console.log(`\nTotal : ${totalChanges} contacts à mettre à jour`)
  if (!applyMode) console.log('👉 Relance avec --apply pour appliquer les changements')
}

run()
