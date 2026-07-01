/**
 * import-pronto.mjs
 *
 * Import d'un export Pronto (XLSX) vers Supabase.
 *
 * Logique de dédup :
 *   1. Match sur id_url_linkedin (ACw... extrait de Linkedin Id Url ou Sales Navigator Url)
 *   2. Fallback sur linkedin_url
 *   3. Sinon → INSERT
 *
 * Pour les contacts existants : met à jour position/company si changé (snapshot).
 * Pour les nouveaux : INSERT + rattachement entreprise.
 * Crée la relation contacts_membres_relations pour le membre spécifié.
 * niveau_de_relation = 'Non renseigné' (n'écrase pas si relation déjà existante).
 * Recalcule nb_personnes_digi_relation après insertion des relations.
 *
 * Usage:
 *   node scripts/import-pronto.mjs --file=Pronto_lead_export_julie-melet_12062026.xlsx --membre=2ec0f1b9-d790-4dd7-b77e-c3c92312b96d
 *   node scripts/import-pronto.mjs --file=... --membre=... --dry-run
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

// ── Env ──────────────────────────────────────────────────────────────
const envContent = readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// ── Args ─────────────────────────────────────────────────────────────
const cliArgs = process.argv.slice(2)
const filePath = cliArgs.find(a => a.startsWith('--file='))?.split('=')[1]
const membreId = cliArgs.find(a => a.startsWith('--membre='))?.split('=')[1]
const dryRun = cliArgs.includes('--dry-run')

if (!filePath || !membreId) {
  console.error('Usage: node scripts/import-pronto.mjs --file=fichier.xlsx --membre=<uuid> [--dry-run]')
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────

// Normalise les noms de colonnes selon le format du fichier
function normalizeRow(r) {
  // Format 3 : Julie Lecomte / Relations LinkedIn export (colonnes en minuscules)
  if ('member linkedin sales nav id' in r || 'first name' in r) {
    const salesNavUrn = String(r['member linkedin sales nav id'] || '')
    const acwMatch = salesNavUrn.match(/\(([^,]+)/)
    const acwId = acwMatch ? acwMatch[1] : null

    const companyLinkedinUrn = String(r['company linkedin id'] || '')
    const companyIdMatch = companyLinkedinUrn.match(/salesCompany:(\d+)/)
    const companyId = companyIdMatch ? companyIdMatch[1] : null

    const employeeCountRaw = r['linkedin company employee count']
    const employeeCount = employeeCountRaw != null && employeeCountRaw !== ''
      ? Number(employeeCountRaw) : null

    return {
      _acw_id: acwId,
      _email: r['email'] || null,
      _employee_count: employeeCount,
      'Linkedin Id Url': '',
      'Sales Navigator Profile Url': '',
      'Linkedin Profile Url': r['linkedin url'] || '',
      'First Name': r['first name'] || '',
      'Last Name': r['last name'] || '',
      'Title': r['job title'] || '',
      'Location': r['location'] || '',
      'Company Name': r['company'] || '',
      'Company Cleaned Name': r['company'] || '',
      'Company Linkedin': companyId,
      'Company Website': r['corporate website'] || '',
      'Company Domain': '',
      'Company Location': r['linkedin company location'] || '',
      'Company Industry': r['linkedin industry'] || null,
      'Employee Range': r['linkedin employees'] || null,
      'Years In Position': null,
      'Months In Position': null,
      'Years In Company': null,
      'Months In Company': null,
      'Connection Degree': r['number of connections'] || null,
      'Is Premium Linkedin': r['premium member'] ?? false,
      'Is Open Profile Linkedin': r['open profile'] ?? false,
      'Profile Image Url': r['profile picture'] || null,
    }
  }

  // Formats 1 & 2 : Pronto standard / Clément
  return {
    _acw_id: null,
    _email: null,
    _employee_count: null,
    'Linkedin Id Url':           r['Linkedin Id Url']           || r['Prospect Linkedin ID URL'] || '',
    'Sales Navigator Profile Url': r['Sales Navigator Profile Url'] || r['Prospect Sales Navigator URL'] || '',
    'Linkedin Profile Url':      r['Linkedin Profile Url']      || r['Prospect Linkedin URL'] || '',
    'First Name':                r['First Name']                || '',
    'Last Name':                 r['Last Name']                 || '',
    'Title':                     r['Title']                     || r['Prospect Position'] || '',
    'Location':                  r['Location']                  || r['Prospect Location'] || '',
    'Company Name':              r['Company Name']              || '',
    'Company Cleaned Name':      r['Company Cleaned Name']      || r['Company Name'] || '',
    'Company Linkedin':          r['Company Linkedin']          || (r['Company Linkedin URL'] ? String(r['Company Linkedin URL']).replace(/.*company\//, '').replace(/\/$/, '') : null),
    'Company Website':           r['Company Website']           || '',
    'Company Domain':            r['Company Domain']            || '',
    'Company Location':          r['Company Location']          || '',
    'Company Industry':          null,
    'Employee Range':            r['Employee Range']            || r['Company Employee Range'] || r['Company Employee Count'] || null,
    'Years In Position':         r['Years In Position']         ?? r['Years in Position'] ?? null,
    'Months In Position':        r['Months In Position']        ?? r['Months in Position'] ?? null,
    'Years In Company':          r['Years In Company']          ?? r['Years in Company'] ?? null,
    'Months In Company':         r['Months In Company']         ?? r['Months in Company'] ?? null,
    'Connection Degree':         r['Connection Degree']         || r['Prospect Connections'] || null,
    'Is Premium Linkedin':       r['Is Premium Linkedin']       ?? r['Prospect is Premium'] ?? false,
    'Is Open Profile Linkedin':  r['Is Open Profile Linkedin']  ?? r['Prospect is Open Profile'] ?? false,
    'Profile Image Url':         r['Profile Image Url']         || r['Prospect Profile Picture'] || null,
  }
}

function extractAcwId(row) {
  if (row._acw_id) return row._acw_id  // pré-extrait pour le format Julie Lecomte
  const url = row['Linkedin Id Url'] || row['Sales Navigator Profile Url'] || ''
  const match = url.match(/\/(ACw[^,/\s]+)/)
  return match ? match[1] : null
}

function extractSalesNavUrl(row) {
  const url = row['Sales Navigator Profile Url'] || ''
  // Le format en base est ACwID,NAME — le Pronto exporte ACwID,
  // On normalise en ACwID,NAME pour être cohérent avec la base existante
  return url.trim().replace(/,$/, ',NAME') || null
}

function parseEmployeeRange(val) {
  if (!val) return { company_employee_count: null, company_employee_range: null }
  if (typeof val === 'number' || /^\d+$/.test(String(val))) {
    return { company_employee_count: parseInt(val), company_employee_range: null }
  }
  return { company_employee_count: null, company_employee_range: String(val) }
}

// Normalise un nom d'entreprise pour la comparaison : minuscules, sans accents, sans ponctuation
function normalizeCompanyName(name) {
  if (!name) return ''
  return String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // supprime accents
    .replace(/[^a-z0-9\s]/g, ' ')                     // ponctuation → espace
    .replace(/\s+/g, ' ')                              // espaces multiples → un seul
    .trim()
}

function normalizeLinkedinUrl(url) {
  if (!url) return null
  url = String(url).trim()
  if (!url.startsWith('http')) url = 'https://' + url
  return url
}

// ── Read XLSX ─────────────────────────────────────────────────────────
const wb = XLSX.readFile(filePath)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws)
console.log(`📦 ${rows.length} lignes lues depuis ${filePath}\n`)

// ── Parse + dédup ─────────────────────────────────────────────────────
const contactsMap = new Map()   // acwId -> parsed contact data
const entreprisesMap = new Map() // companyLinkedinId -> entreprise data

for (const raw of rows) {
  const r = normalizeRow(raw)
  const acwId = extractAcwId(r)
  const linkedinUrl = normalizeLinkedinUrl(r['Linkedin Profile Url'])
  const key = acwId || linkedinUrl
  if (!key) continue

  if (!contactsMap.has(key)) {
    const companyLinkedinId = r['Company Linkedin'] ? String(r['Company Linkedin']).trim() : null
    const salesNavUrl = extractSalesNavUrl(r)

    // Pour le format Julie Lecomte avec employee count numérique pré-parsé
    const empData = r._employee_count != null
      ? { company_employee_count: r._employee_count, company_employee_range: r['Employee Range'] || null }
      : parseEmployeeRange(r['Employee Range'])

    contactsMap.set(key, {
      acwId,
      linkedin_url: salesNavUrl || linkedinUrl,
      linkedin_profile_url: linkedinUrl,
      id_url_linkedin: acwId,
      first_name: r['First Name'] || null,
      last_name: r['Last Name'] || null,
      position: r['Title'] || null,
      location: r['Location'] || null,
      email: r._email || null,
      company_name: r['Company Name'] || null,
      company_id_linkedin: companyLinkedinId,
      years_in_position: r['Years In Position'] != null ? Number(r['Years In Position']) : null,
      months_in_position: r['Months In Position'] != null ? Number(r['Months In Position']) : null,
      years_in_company: r['Years In Company'] != null ? Number(r['Years In Company']) : null,
      months_in_company: r['Months In Company'] != null ? Number(r['Months In Company']) : null,
      connection_degree: r['Connection Degree'] || null,
      is_premium: String(r['Is Premium Linkedin'] || '').toUpperCase() === 'TRUE',
      is_open_link: String(r['Is Open Profile Linkedin'] || '').toUpperCase() === 'TRUE',
      profile_image_url: r['Profile Image Url'] || null,
      _company: companyLinkedinId ? {
        company_id_linkedin: companyLinkedinId,
        company_name: r['Company Cleaned Name'] || r['Company Name'] || null,
        company_website: r['Company Website'] || null,
        company_domain: r['Company Domain'] || null,
        company_location: r['Company Location'] || null,
        linkedin_industry: r['Company Industry'] || null,
        ...empData,
      } : null,
    })
  }

  // Entreprises
  const companyLinkedinId = r['Company Linkedin'] ? String(r['Company Linkedin']).trim() : null
  if (companyLinkedinId && !entreprisesMap.has(companyLinkedinId)) {
    const empData = r._employee_count != null
      ? { company_employee_count: r._employee_count, company_employee_range: r['Employee Range'] || null }
      : parseEmployeeRange(r['Employee Range'])
    entreprisesMap.set(companyLinkedinId, {
      company_id_linkedin: companyLinkedinId,
      company_name: r['Company Cleaned Name'] || r['Company Name'] || null,
      company_website: r['Company Website'] || null,
      company_domain: r['Company Domain'] || null,
      company_location: r['Company Location'] || null,
      linkedin_industry: r['Company Industry'] || null,
      ...empData,
    })
  }
}

const allParsed = [...contactsMap.values()]
console.log(`  Contacts uniques : ${allParsed.length}`)
console.log(`  Entreprises uniques : ${entreprisesMap.size}`)

// ── Step 1 : Chercher contacts existants par id_url_linkedin (indexé) ─
console.log(`\n🔍 Recherche contacts existants par id_url_linkedin...`)

const existingById = new Map()  // acwId -> DB row
const acwIds = allParsed.map(c => c.acwId).filter(Boolean)

for (let i = 0; i < acwIds.length; i += 100) {
  const batch = acwIds.slice(i, i + 100)
  const { data, error } = await supabase
    .from('contacts')
    .select('id, id_url_linkedin, linkedin_url, position, company_name, company_id_linkedin, location, entreprise_id')
    .in('id_url_linkedin', batch)
  if (error) console.error('  ❌', error.message)
  if (data) data.forEach(c => { if (c.id_url_linkedin) existingById.set(c.id_url_linkedin, c) })
}
console.log(`  ${existingById.size} contacts trouvés en base`)

// Classifier chaque contact
const toInsert = []
const toUpdate = []  // { csvData, dbRow, changes }

for (const c of allParsed) {
  const dbRow = c.acwId ? existingById.get(c.acwId) : null

  if (!dbRow) {
    toInsert.push(c)
    continue
  }

  const changes = []
  if (c.position && c.position !== dbRow.position)
    changes.push({ field: 'position', old: dbRow.position, new: c.position })
  if (c.company_name && c.company_name !== dbRow.company_name)
    changes.push({ field: 'company_name', old: dbRow.company_name, new: c.company_name })
  if (c.company_id_linkedin && c.company_id_linkedin !== dbRow.company_id_linkedin)
    changes.push({ field: 'company_id_linkedin', old: dbRow.company_id_linkedin, new: c.company_id_linkedin })
  if (c.location && c.location !== dbRow.location)
    changes.push({ field: 'location', old: dbRow.location, new: c.location })

  if (changes.length > 0) toUpdate.push({ csvData: c, dbRow, changes })
}

console.log(`  Existants inchangés : ${allParsed.length - toInsert.length - toUpdate.length}`)
console.log(`  Existants avec changements : ${toUpdate.length}`)
console.log(`  Nouveaux : ${toInsert.length}`)

// ── Step 2 : Snapshots + update contacts existants ────────────────────
if (toUpdate.length > 0) {
  console.log(`\n📸 Mise à jour contacts existants...`)
  let updated = 0

  for (const { csvData, dbRow, changes } of toUpdate) {
    if (changes.length <= 5) {
      const name = `${csvData.first_name} ${csvData.last_name}`
      console.log(`  ${name}: ${changes.map(c => `${c.field}: "${c.old}" → "${c.new}"`).join(', ')}`)
    }

    if (!dryRun) {
      const updateData = {}
      for (const c of changes) updateData[c.field] = c.new

      if (updateData.company_id_linkedin) {
        const { data: ent } = await supabase
          .from('entreprises')
          .select('id')
          .eq('company_id_linkedin', updateData.company_id_linkedin)
          .single()
        if (ent) updateData.entreprise_id = ent.id
      }

      await supabase.from('contacts').update(updateData).eq('id', dbRow.id)
      updated++
    }
  }

  if (toUpdate.length > 5) console.log(`  ... (${toUpdate.length} total)`)
  console.log(`  Mis à jour : ${updated}`)
}

// ── Step 3 : Upsert entreprises ───────────────────────────────────────
console.log(`\n🏢 Upsert entreprises...`)
const entItems = [...entreprisesMap.values()]
let entUpserted = 0

// Charge toutes les entreprises existantes en mémoire et construit un index normalisé
// → résistant aux variations d'orthographe, accents, tirets, ponctuation
const entNameToId = new Map() // normalizeCompanyName(company_name) -> { id, company_id_linkedin }
let entPage = 0
while (true) {
  const { data: existing } = await supabase
    .from('entreprises')
    .select('id, company_name, company_id_linkedin')
    .range(entPage * 1000, (entPage + 1) * 1000 - 1)
  if (!existing || existing.length === 0) break
  for (const e of existing) {
    const key = normalizeCompanyName(e.company_name)
    if (key) entNameToId.set(key, { id: e.id, company_id_linkedin: e.company_id_linkedin })
  }
  if (existing.length < 1000) break
  entPage++
}
console.log(`  ${entNameToId.size} entreprises existantes chargées en mémoire`)

if (!dryRun) {
  // Séparer les entreprises à upsert (pas déjà en base par nom normalisé) des existantes
  const toUpsert = entItems.filter(e => !entNameToId.has(normalizeCompanyName(e.company_name)))
  for (let i = 0; i < toUpsert.length; i += 50) {
    const batch = toUpsert.slice(i, i + 50)
    const { error } = await supabase
      .from('entreprises')
      .upsert(batch, { onConflict: 'company_id_linkedin', ignoreDuplicates: false })
    if (!error) entUpserted += batch.length
    else console.error('  ❌ entreprises upsert error:', error.message)
  }
}
const skipped = entItems.filter(e => entNameToId.has(normalizeCompanyName(e.company_name))).length
console.log(`  ${entUpserted} entreprises upsertées (${skipped} déjà en base par nom normalisé)`)

// ── Step 4 : Insert nouveaux contacts ─────────────────────────────────
console.log(`\n👤 Insertion nouveaux contacts...`)
let conInserted = 0

if (!dryRun && toInsert.length > 0) {
  // Résoudre entreprise_id : d'abord par company_id_linkedin, sinon par company_name
  for (const c of toInsert) {
    if (c.company_id_linkedin) {
      const { data: ent } = await supabase
        .from('entreprises')
        .select('id')
        .eq('company_id_linkedin', c.company_id_linkedin)
        .single()
      if (ent) { c.entreprise_id = ent.id; continue }
    }
    // Fallback par company_name normalisé
    if (c.company_name) {
      const existing = entNameToId.get(normalizeCompanyName(c.company_name))
      if (existing) c.entreprise_id = existing.id
    }
  }

  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50).map(c => ({
      linkedin_url: c.linkedin_url,
      id_url_linkedin: c.id_url_linkedin,
      first_name: c.first_name,
      last_name: c.last_name,
      position: c.position,
      location: c.location,
      email: c.email || null,
      company_name: c.company_name,
      company_id_linkedin: c.company_id_linkedin,
      entreprise_id: c.entreprise_id || null,
      years_in_position: c.years_in_position,
      months_in_position: c.months_in_position,
      years_in_company: c.years_in_company,
      months_in_company: c.months_in_company,
      connection_degree: c.connection_degree,
      is_premium: c.is_premium,
      is_open_link: c.is_open_link,
      profile_image_url: c.profile_image_url,
    }))

    const { error } = await supabase
      .from('contacts')
      .upsert(batch, { onConflict: 'linkedin_url', ignoreDuplicates: true })
    if (!error) conInserted += batch.length
    else console.error('  ❌ contacts insert error:', error.message)
  }
}
console.log(`  ${conInserted} nouveaux contacts insérés`)

// ── Step 5 : Créer les relations membre-contact ───────────────────────
console.log(`\n🔗 Création relations contacts_membres_relations...`)

// Récupérer tous les IDs contacts (nouveaux + existants concernés)
const allAcwIds = allParsed.map(c => c.acwId).filter(Boolean)
const allContactIds = new Map() // acwId -> contact.id

for (let i = 0; i < allAcwIds.length; i += 100) {
  const batch = allAcwIds.slice(i, i + 100)
  const { data, error } = await supabase
    .from('contacts')
    .select('id, id_url_linkedin, linkedin_url')
    .in('id_url_linkedin', batch)
  if (error) console.error('  ❌ fetch ids error:', error.message)
  if (data) data.forEach(c => allContactIds.set(c.id_url_linkedin, c.id))
}

// Fallback pour ceux sans acwId
const noAcwContacts = allParsed.filter(c => !c.acwId && c.linkedin_url)
if (noAcwContacts.length > 0) {
  const urls = noAcwContacts.map(c => c.linkedin_url)
  for (let i = 0; i < urls.length; i += 500) {
    const batch = urls.slice(i, i + 500)
    const { data } = await supabase
      .from('contacts')
      .select('id, linkedin_url')
      .in('linkedin_url', batch)
    if (data) data.forEach(c => allContactIds.set(c.linkedin_url, c.id))
  }
}

const relations = []
for (const c of allParsed) {
  const contactId = allContactIds.get(c.acwId) || allContactIds.get(c.linkedin_url)
  if (!contactId) continue
  relations.push({
    contact_id: contactId,
    membre_id: membreId,
    niveau_de_relation: 'Non renseigné',
  })
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

// ── Step 6 : Recalculer nb_personnes_digi_relation ────────────────────
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
    for (const row of counts) {
      countMap.set(row.contact_id, (countMap.get(row.contact_id) || 0) + 1)
    }

    for (const [contactId, count] of countMap) {
      await supabase
        .from('contacts')
        .update({ nb_personnes_digi_relation: count })
        .eq('id', contactId)
      nbUpdated++
    }
  }
}
console.log(`  ${nbUpdated} contacts mis à jour`)

// ── Résumé ────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`)
console.log(`📋 RÉSUMÉ IMPORT PRONTO${dryRun ? ' (DRY RUN)' : ''}`)
console.log(`${'═'.repeat(50)}`)
console.log(`  Contacts dans le fichier  : ${allParsed.length}`)
console.log(`  Nouveaux contacts insérés : ${conInserted}`)
console.log(`  Contacts mis à jour       : ${toUpdate.length}`)
console.log(`  Entreprises upsertées     : ${entUpserted}`)
console.log(`  Relations créées          : ${relInserted}`)
console.log(`  nb_personnes recalculé    : ${nbUpdated}`)
console.log(`${'═'.repeat(50)}`)
