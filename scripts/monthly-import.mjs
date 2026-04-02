/**
 * monthly-import.mjs
 *
 * Script d'import mensuel des scraping LinkedIn.
 *
 * 1. Importe les nouveaux contacts + entreprises (ON CONFLICT skip)
 * 2. Détecte les changements (poste, entreprise) et crée des snapshots
 * 3. Met à jour les contacts existants qui ont changé
 * 4. Crée les relations membres-contacts
 * 5. Rattache les contacts aux entreprises par company_id_linkedin
 * 6. Affiche les nouvelles entreprises sans taille (à enrichir via Phantombuster)
 *
 * Usage:
 *   node scripts/monthly-import.mjs --file=seed/extraction_contacts_MOIS.csv
 *   node scripts/monthly-import.mjs --file=seed/extraction_contacts_MOIS.csv --dry-run
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'

// Load .env
const envContent = readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const args = process.argv.slice(2)
const filePath = args.find(a => a.startsWith('--file='))?.split('=')[1]
const dryRun = args.includes('--dry-run')

if (!filePath) {
  console.error('Usage: node scripts/monthly-import.mjs --file=seed/fichier.csv [--dry-run]')
  process.exit(1)
}

function parseDuration(s) {
  if (!s) return { years: null, months: null }
  const yMatch = s.match(/(\d+)\s*year/)
  const mMatch = s.match(/(\d+)\s*month/)
  return {
    years: yMatch ? parseInt(yMatch[1]) : 0,
    months: mMatch ? parseInt(mMatch[1]) : 0,
  }
}

async function main() {
  const content = readFileSync(filePath, 'utf8')
  const rows = parse(content, { columns: true, skip_empty_lines: true })
  console.log(`📦 Read ${rows.length} rows from ${filePath}\n`)

  // ── Deduplicate CSV ──────────────────────────────────────────────
  const entreprisesMap = new Map()   // companyId -> data
  const contactsMap = new Map()      // vmid -> data
  const contactOwners = new Map()    // vmid -> Set<ownerName>

  for (const r of rows) {
    const cid = (r.companyId || '').trim()
    if (cid && !entreprisesMap.has(cid)) {
      entreprisesMap.set(cid, {
        company_name: r.companyName || null,
        company_id_linkedin: cid,
        company_location: r.companyLocation || null,
      })
    }

    const vmid = (r.vmid || '').trim()
    if (!vmid) continue

    if (!contactsMap.has(vmid)) {
      const roleD = parseDuration(r.durationInRole)
      const compD = parseDuration(r.durationInCompany)
      contactsMap.set(vmid, {
        linkedin_url: r.profileUrl || null,
        first_name: r.firstName || null,
        last_name: r.lastName || null,
        position: r.title || null,
        location: r.location || null,
        company_name: r.companyName || null,
        company_id_linkedin: cid || null,
        years_in_position: roleD.years,
        months_in_position: roleD.months,
        years_in_company: compD.years,
        months_in_company: compD.months,
        id_url_linkedin: vmid,
        connection_degree: r.connectionDegree || null,
        is_premium: (r.isPremium || '').toUpperCase() === 'TRUE',
        is_open_link: (r.isOpenLink || '').toUpperCase() === 'TRUE',
        shared_connections_count: parseInt(r.sharedConnectionsCount || '0') || 0,
        profile_image_url: r.profileImageUrl || null,
        default_profile_url: r.defaultProfileUrl || null,
      })
      contactOwners.set(vmid, new Set())
    }

    const owner = (r.owner || '').trim()
    if (owner) contactOwners.get(vmid).add(owner)
  }

  console.log(`  Unique entreprises: ${entreprisesMap.size}`)
  console.log(`  Unique contacts: ${contactsMap.size}`)
  console.log(`  Owners: ${[...new Set([...contactOwners.values()].flatMap(s => [...s]))].join(', ')}`)

  // ── Step 1: Fetch existing contacts to detect changes ────────────
  console.log(`\n🔍 Checking existing contacts...`)
  const vmids = [...contactsMap.keys()]
  const existingContacts = new Map()  // vmid -> DB row

  for (let i = 0; i < vmids.length; i += 500) {
    const batch = vmids.slice(i, i + 500)
    const { data } = await supabase
      .from('contacts')
      .select('id, id_url_linkedin, position, company_name, company_id_linkedin, location, entreprise_id')
      .in('id_url_linkedin', batch)

    if (data) {
      for (const c of data) {
        existingContacts.set(c.id_url_linkedin, c)
      }
    }
  }

  const newContacts = [...contactsMap.entries()].filter(([vmid]) => !existingContacts.has(vmid))
  const existingVmids = [...contactsMap.entries()].filter(([vmid]) => existingContacts.has(vmid))
  console.log(`  Existing: ${existingContacts.size}`)
  console.log(`  New: ${newContacts.length}`)

  // ── Step 2: Detect changes + create snapshots ────────────────────
  console.log(`\n📸 Detecting changes & creating snapshots...`)
  let changesDetected = 0
  let snapshotsCreated = 0
  let contactsUpdated = 0

  for (const [vmid, csvData] of existingVmids) {
    const dbRow = existingContacts.get(vmid)
    const changes = []

    if (csvData.position && csvData.position !== dbRow.position) {
      changes.push({ field: 'position', old: dbRow.position, new: csvData.position })
    }
    if (csvData.company_name && csvData.company_name !== dbRow.company_name) {
      changes.push({ field: 'company_name', old: dbRow.company_name, new: csvData.company_name })
    }
    if (csvData.company_id_linkedin && csvData.company_id_linkedin !== dbRow.company_id_linkedin) {
      changes.push({ field: 'company_id_linkedin', old: dbRow.company_id_linkedin, new: csvData.company_id_linkedin })
    }
    if (csvData.location && csvData.location !== dbRow.location) {
      changes.push({ field: 'location', old: dbRow.location, new: csvData.location })
    }

    if (changes.length > 0) {
      changesDetected++

      if (!dryRun) {
        // Create snapshot of current state
        await supabase.from('scraping_snapshots').insert({
          contact_id: dbRow.id,
          scraped_at: new Date().toISOString(),
          position: csvData.position,
          company_name: csvData.company_name,
          company_id_linkedin: csvData.company_id_linkedin,
          location: csvData.location,
          connection_degree: csvData.connection_degree,
          is_premium: csvData.is_premium,
          shared_connections_count: csvData.shared_connections_count,
          profile_image_url: csvData.profile_image_url,
        })
        snapshotsCreated++

        // Update contact with new data
        const updateData = {}
        for (const c of changes) {
          updateData[c.field] = c.new
        }
        // Re-link entreprise if company changed
        if (updateData.company_id_linkedin) {
          const { data: ent } = await supabase
            .from('entreprises')
            .select('id')
            .eq('company_id_linkedin', updateData.company_id_linkedin)
            .single()
          if (ent) updateData.entreprise_id = ent.id
        }
        updateData.last_scraped_at = new Date().toISOString()

        await supabase
          .from('contacts')
          .update(updateData)
          .eq('id', dbRow.id)
        contactsUpdated++
      }

      if (changesDetected <= 10) {
        const name = `${csvData.first_name} ${csvData.last_name}`
        console.log(`  ${name}: ${changes.map(c => `${c.field}: "${c.old}" → "${c.new}"`).join(', ')}`)
      }
    }
  }

  if (changesDetected > 10) {
    console.log(`  ... et ${changesDetected - 10} autres changements`)
  }
  console.log(`  Total changes: ${changesDetected}`)
  console.log(`  Snapshots created: ${snapshotsCreated}`)
  console.log(`  Contacts updated: ${contactsUpdated}`)

  // ── Step 3: Insert new entreprises ───────────────────────────────
  console.log(`\n🏢 Inserting new entreprises...`)
  const entItems = [...entreprisesMap.values()]
  let entInserted = 0

  if (!dryRun) {
    for (let i = 0; i < entItems.length; i += 50) {
      const batch = entItems.slice(i, i + 50)
      const { error } = await supabase.from('entreprises').upsert(batch, { onConflict: 'company_id_linkedin', ignoreDuplicates: true })
      if (!error) entInserted += batch.length
    }
  }
  console.log(`  ${entInserted} entreprises upserted`)

  // ── Step 4: Insert new contacts ──────────────────────────────────
  console.log(`\n👤 Inserting new contacts...`)
  let conInserted = 0

  if (!dryRun) {
    for (const [vmid, data] of newContacts) {
      // Resolve entreprise_id
      if (data.company_id_linkedin) {
        const { data: ent } = await supabase
          .from('entreprises')
          .select('id')
          .eq('company_id_linkedin', data.company_id_linkedin)
          .single()
        if (ent) data.entreprise_id = ent.id
      }
      data.last_scraped_at = new Date().toISOString()
    }

    for (let i = 0; i < newContacts.length; i += 50) {
      const batch = newContacts.slice(i, i + 50).map(([, data]) => data)
      const { error } = await supabase.from('contacts').upsert(batch, { onConflict: 'linkedin_url', ignoreDuplicates: true })
      if (!error) conInserted += batch.length
      if ((i + 50) % 500 === 0) console.log(`  ${Math.min(i + 50, newContacts.length)}/${newContacts.length}`)
    }
  }
  console.log(`  ${conInserted} new contacts inserted`)

  // ── Step 5: Create relations ─────────────────────────────────────
  console.log(`\n🔗 Creating relations...`)
  const { data: membres } = await supabase.from('membres_digilityx').select('id, full_name')
  const membreMap = Object.fromEntries((membres || []).map(m => [m.full_name, m.id]))

  // Re-fetch all contact IDs (including newly created)
  const allContactIds = new Map()
  for (let i = 0; i < vmids.length; i += 500) {
    const batch = vmids.slice(i, i + 500)
    const { data } = await supabase
      .from('contacts')
      .select('id, id_url_linkedin')
      .in('id_url_linkedin', batch)
    if (data) {
      for (const c of data) allContactIds.set(c.id_url_linkedin, c.id)
    }
  }

  const relations = []
  for (const [vmid, owners] of contactOwners) {
    const contactId = allContactIds.get(vmid)
    if (!contactId) continue
    for (const ownerName of owners) {
      const membreId = membreMap[ownerName]
      if (!membreId) continue
      relations.push({ contact_id: contactId, membre_id: membreId, niveau_de_relation: 'Connaissance' })
    }
  }

  let relInserted = 0
  if (!dryRun) {
    for (let i = 0; i < relations.length; i += 50) {
      const batch = relations.slice(i, i + 50)
      const { error } = await supabase.from('contacts_membres_relations').upsert(batch, { onConflict: 'contact_id,membre_id', ignoreDuplicates: true })
      if (!error) relInserted += batch.length
      if ((i + 50) % 1000 === 0) console.log(`  ${Math.min(i + 50, relations.length)}/${relations.length}`)
    }
  }
  console.log(`  ${relInserted} relations upserted`)

  // ── Step 6: Report entreprises without size ──────────────────────
  console.log(`\n📊 Entreprises sans taille (à enrichir via Phantombuster):`)
  const { count } = await supabase
    .from('entreprises')
    .select('id', { count: 'exact', head: true })
    .is('company_employee_count', null)
  console.log(`  ${count} entreprises sans taille`)

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📋 RÉSUMÉ IMPORT MENSUEL${dryRun ? ' (DRY RUN)' : ''}`)
  console.log(`${'═'.repeat(50)}`)
  console.log(`  Contacts existants avec changements: ${changesDetected}`)
  console.log(`    - Changements de poste/entreprise détectés`)
  console.log(`    - Snapshots créés: ${snapshotsCreated}`)
  console.log(`    - Contacts mis à jour: ${contactsUpdated}`)
  console.log(`  Nouveaux contacts: ${conInserted}`)
  console.log(`  Nouvelles entreprises: ${entInserted}`)
  console.log(`  Relations créées: ${relInserted}`)
  console.log(`  Entreprises sans taille: ${count}`)
  console.log(`${'═'.repeat(50)}`)

  if (count > 0) {
    console.log(`\n💡 Prochaine étape: lancer le Phantombuster Company Scraper`)
    console.log(`   puis: node scripts/import-phantombuster-companies.mjs --file=<résultat.csv>`)
  }
}

main().catch(console.error)
