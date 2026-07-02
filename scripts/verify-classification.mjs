/**
 * Vérifie la cohérence des classifications existantes en base vs les règles du script.
 * Et compte les contacts Tier 1 couverts vs non couverts par les relations membres.
 * Usage: node scripts/verify-classification.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { getHierarchie, getPersona } from './classify-persona-hierarchie.mjs'

const envContent = readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// 1. Total contacts Tier 1 avec une position
const { count: totalTier1 } = await sb.from('contacts')
  .select('*', { count: 'exact', head: true })
  .not('entreprise_id', 'is', null)
  .not('position', 'is', null)
  // filter by tier via join
const tier1Ids = new Set()
let from = 0
while (true) {
  const { data } = await sb.from('entreprises').select('id').eq('tier', 'Tier 1').range(from, from + 999)
  if (!data || !data.length) break
  data.forEach(e => tier1Ids.add(e.id))
  if (data.length < 1000) break
  from += 1000
}
console.log(`Entreprises Tier 1 : ${tier1Ids.size}`)

let allTier1Contacts = [], page = 0
while (true) {
  const { data } = await sb.from('contacts')
    .select('id, position, persona, hierarchie, entreprise_id')
    .not('position', 'is', null)
    .range(page * 1000, (page + 1) * 1000 - 1)
  if (!data || !data.length) break
  allTier1Contacts.push(...data.filter(c => tier1Ids.has(c.entreprise_id)))
  if (data.length < 1000) break
  page++
}
console.log(`Contacts Tier 1 avec position : ${allTier1Contacts.length}`)
console.log(`  dont sans persona/hierarchie : ${allTier1Contacts.filter(c => !c.persona || !c.hierarchie).length}`)

// 2. Vérification des déjà classifiés
const classified = allTier1Contacts.filter(c => c.persona && c.hierarchie)
console.log(`\n📊 ${classified.length} contacts déjà classifiés vérifiés\n`)

let ok = 0, mismatch = 0
const mismatches = []

for (const c of classified) {
  const expectedHier = getHierarchie(c.position)
  const expectedPersona = getPersona(c.position, expectedHier)
  const hierMatch = expectedHier === c.hierarchie
  const personaMatch = expectedPersona === c.persona

  if (hierMatch && personaMatch) ok++
  else {
    mismatch++
    mismatches.push({ position: c.position, dbHier: c.hierarchie, expectedHier, dbPersona: c.persona, expectedPersona, hierOK: hierMatch, personaOK: personaMatch })
  }
}

console.log(`✅ Cohérents  : ${ok} (${Math.round(ok/classified.length*100)}%)`)
console.log(`⚠️  Différents : ${mismatch}\n`)

if (mismatches.length > 0) {
  console.log('Exemples de différences :')
  for (const m of mismatches.slice(0, 25)) {
    if (!m.hierOK) console.log(`  [HIER] "${m.position}" → DB:${m.dbHier} vs script:${m.expectedHier}`)
    if (!m.personaOK) console.log(`  [PERS] "${m.position}" → DB:${m.dbPersona} vs script:${m.expectedPersona}`)
  }
}
