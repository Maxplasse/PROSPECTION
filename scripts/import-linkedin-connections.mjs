/**
 * import-linkedin-connections.mjs
 *
 * Import d'un export LinkedIn natif (connexions) vers Supabase.
 *
 * Format attendu (colonnes) :
 *   profileUrl, firstName, lastName, fullName, title,
 *   connectionSince, profileImageUrl, timestamp,
 *   connectedProfileUrl, connectedUsername
 *
 * Logique de dédup :
 *   1. Match sur id_url_linkedin (extrait de profileUrl si format /in/ACw...)
 *   2. Match sur linkedin_url (normalisé)
 *   3. Sinon → INSERT
 *
 * Pour les contacts existants : met à jour position si changé (sans écraser statut/scoring/persona).
 * Pour les nouveaux : INSERT avec les champs disponibles.
 * Crée la relation contacts_membres_relations pour le membre spécifié.
 * niveau_de_relation = 'Non renseigné' (n'écrase pas si relation déjà existante).
 * Recalcule nb_personnes_digi_relation après insertion.
 *
 * Usage :
 *   node scripts/import-linkedin-connections.mjs --file=Alexandra_Martin_Linkedin_contacts.xlsx --membre=<uuid>
 *   node scripts/import-linkedin-connections.mjs --file=... --membre=... --dry-run
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

// ── Env ───────────────────────────────────────────────────────────────
const envContent = readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// ── Args ──────────────────────────────────────────────────────────────
const cliArgs = process.argv.slice(2)
const filePath = cliArgs.find(a => a.startsWith('--file='))?.split('=')[1]
const membreId = cliArgs.find(a => a.startsWith('--membre='))?.split('=')[1]
const dryRun = cliArgs.includes('--dry-run')

if (!filePath || !membreId) {
  console.error('Usage: node scripts/import-linkedin-connections.mjs --file=fichier.xlsx --membre=<uuid> [--dry-run]')
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────

function normalizeLinkedinUrl(url) {
  if (!url) return null
  url = String(url).trim()
  if (!url.startsWith('http')) url = 'https://' + url
  // Supprime le slash final et les paramètres de query
  return url.replace(/\/$/, '').split('?')[0]
}

// Extrait l'ACw... depuis une URL Sales Navigator (pas présent dans les URLs /in/ standard)
function extractAcwId(url) {
  if (!url) return null
  const match = String(url).match(/\/(ACw[^,/\s?]+)/)
  return match ? match[1] : null
}

// ── Lecture fichier ───────────────────────────────────────────────────
const wb = XLSX.readFile(filePath)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws)
console.log(`📦 ${rows.length} lignes lues depuis ${filePath}\n`)

// ── Parse + dédup interne ─────────────────────────────────────────────
const contactsMap = new Map() // clé: acwId || linkedin_url normalisée

for (const r of rows) {
  const linkedinUrl = normalizeLinkedinUrl(r.profileUrl)
  const acwId = extractAcwId(r.profileUrl)
  const key = acwId || linkedinUrl
  if (!key) continue

  if (!contactsMap.has(key)) {
    contactsMap.set(key, {
      acwId,
      linkedin_url: linkedinUrl,
      id_url_linkedin: acwId || null,
      first_name: r.firstName || null,
      last_name: r.lastName || null,
      position: r.title || null,
      profile_image_url: r.profileImageUrl || null,
      // Pas de company ni location dans ce format
    })
  }
}

const allParsed = [...contactsMap.values()]
console.log(`  Contacts uniques : ${allParsed.length}`)

// ── Step 1 : Chercher contacts existants ──────────────────────────────
console.log(`\n🔍 Recherche contacts existants...`)

const existingById = new Map()    // acwId -> DB row
const existingByUrl = new Map()   // linkedin_url -> DB row

// Match par id_url_linkedin (les contacts qui en ont un)
const acwIds = allParsed.map(c => c.acwId).filter(Boolean)
if (acwIds.length > 0) {
  for (let i = 0; i < acwIds.length; i += 100) {
    const batch = acwIds.slice(i, i + 100)
    const { data } = await supabase
      .from('contacts')
      .select('id, id_url_linkedin, linkedin_url, position, company_name')
      .in('id_url_linkedin', batch)
    if (data) data.forEach(c => { if (c.id_url_linkedin) existingById.set(c.id_url_linkedin, c) })
  }
}

// Match par linkedin_url (fallback pour ceux sans acwId)
const urlsWithoutAcw = allParsed.filter(c => !c.acwId && c.linkedin_url).map(c => c.linkedin_url)
if (urlsWithoutAcw.length > 0) {
  for (let i = 0; i < urlsWithoutAcw.length; i += 100) {
    const batch = urlsWithoutAcw.slice(i, i + 100)
    const { data } = await supabase
      .from('contacts')
      .select('id, id_url_linkedin, linkedin_url, position, company_name')
      .in('linkedin_url', batch)
    if (data) data.forEach(c => { if (c.linkedin_url) existingByUrl.set(c.linkedin_url, c) })
  }
}

// Classifier
const toInsert = []
const toUpdate = [] // { csvData, dbRow, changes }

for (const c of allParsed) {
  const dbRow = (c.acwId ? existingById.get(c.acwId) : null)
    || (c.linkedin_url ? existingByUrl.get(c.linkedin_url) : null)

  if (!dbRow) {
    toInsert.push(c)
    continue
  }

  const changes = []
  if (c.position && c.position !== dbRow.position)
    changes.push({ field: 'position', old: dbRow.position, new: c.position })

  if (changes.length > 0) toUpdate.push({ csvData: c, dbRow, changes })
}

const unchanged = allParsed.length - toInsert.length - toUpdate.length
console.log(`  Existants inchangés    : ${unchanged}`)
console.log(`  Existants avec changement de poste : ${toUpdate.length}`)
console.log(`  Nouveaux contacts      : ${toInsert.length}`)

// ── Step 2 : Mise à jour contacts existants ───────────────────────────
if (toUpdate.length > 0) {
  console.log(`\n📝 Mise à jour contacts existants...`)
  let updated = 0
  for (const { csvData, dbRow, changes } of toUpdate) {
    const name = `${csvData.first_name} ${csvData.last_name}`
    console.log(`  ${name}: ${changes.map(c => `${c.field}: "${c.old}" → "${c.new}"`).join(', ')}`)
    if (!dryRun) {
      const updateData = {}
      for (const c of changes) updateData[c.field] = c.new
      await supabase.from('contacts').update(updateData).eq('id', dbRow.id)
      updated++
    }
  }
  console.log(`  ${updated} contacts mis à jour`)
}

// ── Step 3 : Insertion nouveaux contacts ──────────────────────────────
console.log(`\n👤 Insertion nouveaux contacts...`)
let conInserted = 0

if (!dryRun && toInsert.length > 0) {
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50).map(c => ({
      linkedin_url: c.linkedin_url,
      id_url_linkedin: c.id_url_linkedin,
      first_name: c.first_name,
      last_name: c.last_name,
      position: c.position,
      profile_image_url: c.profile_image_url,
    }))
    const { error } = await supabase
      .from('contacts')
      .upsert(batch, { onConflict: 'linkedin_url', ignoreDuplicates: true })
    if (!error) conInserted += batch.length
    else console.error('  ❌ insert error:', error.message)
  }
}
console.log(`  ${conInserted} nouveaux contacts insérés`)

// ── Step 4 : Créer les relations membre-contact ───────────────────────
console.log(`\n🔗 Création relations contacts_membres_relations...`)

// Récupérer les IDs en base (nouveaux inclus)
const allLinkedinUrls = allParsed.map(c => c.linkedin_url).filter(Boolean)
const allAcwIds = allParsed.map(c => c.acwId).filter(Boolean)
const contactIdMap = new Map() // clé acwId ou linkedin_url -> contact.id

for (let i = 0; i < allAcwIds.length; i += 100) {
  const batch = allAcwIds.slice(i, i + 100)
  const { data } = await supabase.from('contacts').select('id, id_url_linkedin').in('id_url_linkedin', batch)
  if (data) data.forEach(c => contactIdMap.set(c.id_url_linkedin, c.id))
}
for (let i = 0; i < allLinkedinUrls.length; i += 100) {
  const batch = allLinkedinUrls.slice(i, i + 100)
  const { data } = await supabase.from('contacts').select('id, linkedin_url').in('linkedin_url', batch)
  if (data) data.forEach(c => { if (!contactIdMap.has(c.linkedin_url)) contactIdMap.set(c.linkedin_url, c.id) })
}

const relations = []
for (const c of allParsed) {
  const contactId = (c.acwId ? contactIdMap.get(c.acwId) : null) || contactIdMap.get(c.linkedin_url)
  if (!contactId) continue
  relations.push({ contact_id: contactId, membre_id: membreId, niveau_de_relation: 'Non renseigné' })
}

let relInserted = 0
if (!dryRun) {
  for (let i = 0; i < relations.length; i += 50) {
    const batch = relations.slice(i, i + 50)
    const { error } = await supabase
      .from('contacts_membres_relations')
      .upsert(batch, { onConflict: 'contact_id,membre_id', ignoreDuplicates: true })
    if (!error) relInserted += batch.length
    else console.error('  ❌ relations error:', error.message)
  }
}
console.log(`  ${relInserted} relations upsertées`)

// ── Step 5 : Recalculer nb_personnes_digi_relation ───────────────────
console.log(`\n🔢 Recalcul nb_personnes_digi_relation...`)
let nbUpdated = 0

if (!dryRun && relations.length > 0) {
  const contactIdsToUpdate = [...new Set(relations.map(r => r.contact_id))]

  for (let i = 0; i < contactIdsToUpdate.length; i += 200) {
    const batch = contactIdsToUpdate.slice(i, i + 200)
    const { data: counts } = await supabase
      .from('contacts_membres_relations')
      .select('contact_id')
      .in('contact_id', batch)

    if (!counts) continue
    const countMap = new Map()
    for (const row of counts) countMap.set(row.contact_id, (countMap.get(row.contact_id) || 0) + 1)

    for (const [contactId, count] of countMap) {
      await supabase.from('contacts').update({ nb_personnes_digi_relation: count }).eq('id', contactId)
      nbUpdated++
    }
  }
}
console.log(`  ${nbUpdated} contacts mis à jour`)

// ── Résumé ────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`)
console.log(`📋 RÉSUMÉ IMPORT LINKEDIN CONNECTIONS${dryRun ? ' (DRY RUN)' : ''}`)
console.log(`${'═'.repeat(50)}`)
console.log(`  Contacts dans le fichier         : ${allParsed.length}`)
console.log(`  Nouveaux contacts insérés        : ${conInserted}`)
console.log(`  Contacts mis à jour (poste)      : ${toUpdate.length}`)
console.log(`  Existants inchangés              : ${unchanged}`)
console.log(`  Relations créées                 : ${relInserted}`)
console.log(`  nb_personnes_digi recalculé      : ${nbUpdated}`)
console.log(`${'═'.repeat(50)}`)

if (dryRun) {
  console.log(`\n💡 Relance sans --dry-run pour appliquer les changements.`)
}
