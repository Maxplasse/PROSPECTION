/**
 * enrich-from-xlsx.mjs
 *
 * Re-reads all xlsx files and generates SQL to update:
 * - contacts: summary, title_description, connection_degree, is_premium, is_open_link,
 *             shared_connections_count, profile_image_url, default_profile_url, last_scraped_at
 * - contacts_membres_relations: connection_degree
 *
 * Usage: node scripts/enrich-from-xlsx.mjs
 */

import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'

const SEED_DIR = 'seed'
const OUT_DIR = 'scripts/generated-sql'

function escSql(val) {
  if (val === null || val === undefined) return 'NULL'
  const s = String(val).replace(/'/g, "''")
  return `'${s}'`
}

// ── Read all files ───────────────────────────────────────────────────

const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.xlsx'))
const allRows = []

for (const f of files) {
  const wb = XLSX.readFile(path.join(SEED_DIR, f))
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
  allRows.push(...data)
}

console.log(`Read ${allRows.length} total rows from ${files.length} files`)

// ── Build contact enrichment data (dedup by vmid, keep richest row) ──

const contactData = {} // vmid -> enrichment fields
for (const r of allRows) {
  if (!r.vmid) continue
  const existing = contactData[r.vmid]
  // Keep the row with the most data (prefer one with summary)
  if (!existing || (r.summary && !existing.summary)) {
    contactData[r.vmid] = {
      vmid: r.vmid,
      summary: r.summary || null,
      title_description: r.titleDescription || null,
      connection_degree: r.connectionDegree || null,
      is_premium: r.isPremium === true || r.isPremium === 'true',
      is_open_link: r.isOpenLink === true || r.isOpenLink === 'true',
      shared_connections_count: typeof r.sharedConnectionsCount === 'number' ? r.sharedConnectionsCount : 0,
      profile_image_url: r.profileImageUrl || null,
      default_profile_url: r.defaultProfileUrl || null,
      last_scraped_at: r.timestamp || null,
    }
  }
}

console.log(`${Object.keys(contactData).length} unique contacts to enrich`)

// ── Build relation enrichment data ──

const relationUpdates = [] // { vmid, ownerName, connectionDegree }
for (const r of allRows) {
  if (!r.vmid || !r.owner || !r.connectionDegree) continue
  relationUpdates.push({
    vmid: r.vmid,
    owner: r.owner.trim(),
    degree: r.connectionDegree,
  })
}

console.log(`${relationUpdates.length} relation degree updates`)

// ── Generate contact update SQL ──────────────────────────────────────

// Clean old enrichment files
const oldFiles = fs.readdirSync(OUT_DIR).filter(f => f.startsWith('enrich_'))
oldFiles.forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)))

const contacts = Object.values(contactData)
const BATCH = 200
let fileIdx = 0

for (let i = 0; i < contacts.length; i += BATCH) {
  fileIdx++
  const batch = contacts.slice(i, i + BATCH)

  // Use individual UPDATE statements for reliability with text fields
  const statements = batch.map(c => {
    const sets = []
    if (c.summary) sets.push(`summary = ${escSql(c.summary)}`)
    if (c.title_description) sets.push(`title_description = ${escSql(c.title_description)}`)
    if (c.connection_degree) sets.push(`connection_degree = ${escSql(c.connection_degree)}`)
    sets.push(`is_premium = ${c.is_premium}`)
    sets.push(`is_open_link = ${c.is_open_link}`)
    sets.push(`shared_connections_count = ${c.shared_connections_count}`)
    if (c.profile_image_url) sets.push(`profile_image_url = ${escSql(c.profile_image_url)}`)
    if (c.default_profile_url) sets.push(`default_profile_url = ${escSql(c.default_profile_url)}`)
    if (c.last_scraped_at) sets.push(`last_scraped_at = ${escSql(c.last_scraped_at)}`)

    return `UPDATE contacts SET ${sets.join(', ')} WHERE id_url_linkedin = ${escSql(c.vmid)};`
  })

  const sql = statements.join('\n')
  fs.writeFileSync(path.join(OUT_DIR, `enrich_contacts_${String(fileIdx).padStart(2, '0')}.sql`), sql)
}

console.log(`Generated ${fileIdx} contact enrichment SQL files`)

// ── Generate relation degree update SQL ──────────────────────────────

// We need to map owner names to membre IDs - read from the membres SQL we generated earlier
// Actually, we'll do it in SQL using a subquery with full_name matching

const RBATCH = 500
let rFileIdx = 0

for (let i = 0; i < relationUpdates.length; i += RBATCH) {
  rFileIdx++
  const batch = relationUpdates.slice(i, i + RBATCH)

  const statements = batch.map(r => {
    const degree = r.degree === '1st' ? '1st' : r.degree === '2nd' ? '2nd' : r.degree === '3rd' ? '3rd' : null
    if (!degree) return ''
    return `UPDATE contacts_membres_relations SET connection_degree = '${degree}' WHERE contact_id = (SELECT id FROM contacts WHERE id_url_linkedin = ${escSql(r.vmid)} LIMIT 1) AND membre_id = (SELECT id FROM membres_digilityx WHERE full_name = ${escSql(r.owner)} LIMIT 1);`
  }).filter(Boolean)

  const sql = statements.join('\n')
  fs.writeFileSync(path.join(OUT_DIR, `enrich_relations_${String(rFileIdx).padStart(2, '0')}.sql`), sql)
}

console.log(`Generated ${rFileIdx} relation enrichment SQL files`)
console.log(`\nTotal: ${fileIdx + rFileIdx} SQL files`)
