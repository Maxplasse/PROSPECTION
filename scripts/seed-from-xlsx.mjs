/**
 * seed-from-xlsx.mjs
 *
 * Reads all xlsx files from seed/, deduplicates, and generates SQL files
 * to insert into Supabase via MCP or psql.
 *
 * Usage: node scripts/seed-from-xlsx.mjs
 * Output: scripts/generated-sql/ directory with numbered SQL files
 */

import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const SEED_DIR = 'seed'
const OUT_DIR = 'scripts/generated-sql'

// ── Helpers ──────────────────────────────────────────────────────────

function escSql(val) {
  if (val === null || val === undefined) return 'NULL'
  const s = String(val).replace(/'/g, "''")
  return `'${s}'`
}

function parseDuration(str) {
  if (!str) return { years: null, months: null }
  const yMatch = str.match(/(\d+)\s*year/)
  const mMatch = str.match(/(\d+)\s*month/)
  return {
    years: yMatch ? parseInt(yMatch[1]) : 0,
    months: mMatch ? parseInt(mMatch[1]) : 0,
  }
}

function splitName(fullName) {
  if (!fullName) return { firstName: null, lastName: null }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
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

// ── Extract unique membres ───────────────────────────────────────────

const ownerNames = new Set()
allRows.forEach(r => { if (r.owner) ownerNames.add(r.owner.trim()) })

const membreMap = {} // name -> uuid
for (const name of ownerNames) {
  membreMap[name] = randomUUID()
}

console.log(`${Object.keys(membreMap).length} unique membres`)

// ── Extract unique entreprises ───────────────────────────────────────

const entrepriseMap = {} // companyId -> { uuid, data }
for (const r of allRows) {
  const cid = r.companyId ? String(r.companyId) : null
  if (!cid) continue
  if (entrepriseMap[cid]) continue
  entrepriseMap[cid] = {
    uuid: randomUUID(),
    company_name: r.companyName || null,
    company_id_linkedin: cid,
    company_location: r.companyLocation || null,
  }
}

console.log(`${Object.keys(entrepriseMap).length} unique entreprises`)

// ── Extract unique contacts + relations ──────────────────────────────

const contactMap = {} // vmid -> { uuid, data, owners: Set }
for (const r of allRows) {
  const vmid = r.vmid
  if (!vmid) continue

  if (!contactMap[vmid]) {
    const roleD = parseDuration(r.durationInRole)
    const compD = parseDuration(r.durationInCompany)
    const cid = r.companyId ? String(r.companyId) : null

    contactMap[vmid] = {
      uuid: randomUUID(),
      linkedin_url: r.profileUrl || null,
      first_name: r.firstName || null,
      last_name: r.lastName || null,
      position: r.title || null,
      location: r.location || null,
      company_name: r.companyName || null,
      company_id_linkedin: cid,
      entreprise_id: cid && entrepriseMap[cid] ? entrepriseMap[cid].uuid : null,
      years_in_position: roleD.years,
      months_in_position: roleD.months,
      years_in_company: compD.years,
      months_in_company: compD.months,
      id_url_linkedin: vmid,
      query: r.query || null,
      owners: new Set(),
    }
  }

  if (r.owner) {
    contactMap[vmid].owners.add(r.owner.trim())
  }
}

console.log(`${Object.keys(contactMap).length} unique contacts`)

// Count relations
let relationCount = 0
for (const c of Object.values(contactMap)) {
  relationCount += c.owners.size
}
console.log(`${relationCount} contact-membre relations`)

// ── Generate SQL ─────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true })

let fileIndex = 0

function writeSQL(filename, sql) {
  fileIndex++
  const fullName = `${String(fileIndex).padStart(2, '0')}_${filename}.sql`
  fs.writeFileSync(path.join(OUT_DIR, fullName), sql)
  console.log(`  Written ${fullName} (${(sql.length / 1024).toFixed(0)} KB)`)
}

// 1. Membres
{
  const values = Object.entries(membreMap).map(([name, uuid]) => {
    const { firstName, lastName } = splitName(name)
    return `(${escSql(uuid)}, ${escSql(firstName)}, ${escSql(lastName)}, 'membre')`
  })
  const sql = `INSERT INTO membres_digilityx (id, first_name, last_name, role) VALUES\n${values.join(',\n')};\n`
  writeSQL('membres', sql)
}

// 2. Entreprises (batch by 2000)
{
  const entries = Object.values(entrepriseMap)
  const BATCH = 2000
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    const values = batch.map(e =>
      `(${escSql(e.uuid)}, ${escSql(e.company_name)}, ${escSql(e.company_id_linkedin)}, ${escSql(e.company_location)})`
    )
    const sql = `INSERT INTO entreprises (id, company_name, company_id_linkedin, company_location) VALUES\n${values.join(',\n')}\nON CONFLICT (company_id_linkedin) DO NOTHING;\n`
    writeSQL(`entreprises_${Math.floor(i / BATCH) + 1}`, sql)
  }
}

// 3. Contacts (batch by 1000 — more columns so bigger rows)
{
  const entries = Object.values(contactMap)
  const BATCH = 1000
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    const values = batch.map(c =>
      `(${escSql(c.uuid)}, ${escSql(c.linkedin_url)}, ${escSql(c.first_name)}, ${escSql(c.last_name)}, ${escSql(c.position)}, ${escSql(c.location)}, ${escSql(c.company_name)}, ${escSql(c.company_id_linkedin)}, ${c.entreprise_id ? escSql(c.entreprise_id) : 'NULL'}, ${c.years_in_position !== null ? c.years_in_position : 'NULL'}, ${c.months_in_position !== null ? c.months_in_position : 'NULL'}, ${c.years_in_company !== null ? c.years_in_company : 'NULL'}, ${c.months_in_company !== null ? c.months_in_company : 'NULL'}, ${escSql(c.id_url_linkedin)}, ${escSql(c.query)})`
    )
    const sql = `INSERT INTO contacts (id, linkedin_url, first_name, last_name, position, location, company_name, company_id_linkedin, entreprise_id, years_in_position, months_in_position, years_in_company, months_in_company, id_url_linkedin, query) VALUES\n${values.join(',\n')};\n`
    writeSQL(`contacts_${Math.floor(i / BATCH) + 1}`, sql)
  }
}

// 4. Relations (batch by 2000)
{
  const relations = []
  for (const c of Object.values(contactMap)) {
    for (const ownerName of c.owners) {
      const membreId = membreMap[ownerName]
      if (!membreId) continue
      relations.push({ contact_id: c.uuid, membre_id: membreId })
    }
  }

  const BATCH = 2000
  for (let i = 0; i < relations.length; i += BATCH) {
    const batch = relations.slice(i, i + BATCH)
    const values = batch.map(r =>
      `(${escSql(r.contact_id)}, ${escSql(r.membre_id)}, 'Connaissance')`
    )
    // Note: We default niveau_de_relation to 'Connaissance' since these are LinkedIn 1st-degree connections
    // The trigger will update contacts.niveau_de_relation and nb_personnes_digi_relation automatically
    const sql = `INSERT INTO contacts_membres_relations (contact_id, membre_id, niveau_de_relation) VALUES\n${values.join(',\n')};\n`
    writeSQL(`relations_${Math.floor(i / BATCH) + 1}`, sql)
  }
}

// 5. Position history (batch by 2000)
{
  const positions = []
  for (const c of Object.values(contactMap)) {
    if (!c.position) continue
    positions.push({
      contact_id: c.uuid,
      entreprise_id: c.entreprise_id,
      company_name: c.company_name,
      position: c.position,
    })
  }

  const BATCH = 2000
  for (let i = 0; i < positions.length; i += BATCH) {
    const batch = positions.slice(i, i + BATCH)
    const values = batch.map(p =>
      `(${escSql(p.contact_id)}, ${p.entreprise_id ? escSql(p.entreprise_id) : 'NULL'}, ${escSql(p.company_name)}, ${escSql(p.position)}, TRUE, 'import')`
    )
    const sql = `INSERT INTO contact_positions_history (contact_id, entreprise_id, company_name, position, is_current, source) VALUES\n${values.join(',\n')};\n`
    writeSQL(`positions_${Math.floor(i / BATCH) + 1}`, sql)
  }
}

console.log(`\nDone! ${fileIndex} SQL files generated in ${OUT_DIR}/`)
