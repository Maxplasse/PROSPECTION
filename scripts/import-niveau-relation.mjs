/**
 * import-niveau-relation.mjs
 *
 * Met à jour le niveau_de_relation dans contacts_membres_relations
 * à partir d'un fichier Excel (.xlsx) ou CSV fourni par un membre Digilityx.
 *
 * Le fichier doit contenir :
 *   - Colonnes prénom/nom : "Prénom" + "Nom" (ou une colonne full name)
 *   - Colonne niveau      : "Niveau de relation" (pas "Niveau de relation business")
 *
 * Usage :
 *   node scripts/import-niveau-relation.mjs --file=data/relations.csv --membre="Laurent Corazza"
 *   node scripts/import-niveau-relation.mjs --file=data/relations.csv --membre="Laurent Corazza" --dry-run
 *
 * --dry-run : affiche le SQL généré sans rien écrire en base
 */

import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'

// ── Valeurs valides (CHECK constraint BDD) ────────────────────────────────────

const VALID_NIVEAUX = [
  'Ami',
  'Cercle familial',
  'Ancien collègue',
  'Alumni',
  'Partenaire business',
  'Connaissance',
  'Inconnu',
  'Non renseigné',
]

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const filePath = args.find(a => a.startsWith('--file='))?.slice(7)
const membreArg = args.find(a => a.startsWith('--membre='))?.slice(9)
const dryRun = args.includes('--dry-run')

if (!filePath || !membreArg) {
  console.error('Usage: node scripts/import-niveau-relation.mjs --file=<fichier.csv|xlsx> --membre="Prénom Nom" [--dry-run]')
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`Fichier introuvable : ${filePath}`)
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escSql(val) {
  if (val === null || val === undefined) return 'NULL'
  return `'${String(val).replace(/'/g, "''")}'`
}

// Cherche une colonne dont le nom normalisé correspond EXACTEMENT à l'un des candidats
function findCol(headers, ...candidates) {
  const normalized = headers.map(h => String(h).toLowerCase().trim())
  for (const c of candidates) {
    const idx = normalized.indexOf(c.toLowerCase().trim())
    if (idx !== -1) return headers[idx]
  }
  return null
}

// Normalise les valeurs niveau_de_relation (gère accents cassés + alias)
function normalizeNiveau(raw) {
  if (!raw) return null
  const s = String(raw).trim()

  // Tentative de fix encodage cassé (UTF-8 lu en Latin-1) : re-encode
  let fixed = s
  try {
    fixed = Buffer.from(s, 'latin1').toString('utf8')
  } catch {}

  // Essai sur la valeur originale et la valeur fixée
  for (const candidate of [fixed, s]) {
    if (VALID_NIVEAUX.includes(candidate)) return candidate
    const lower = candidate.toLowerCase()
    const found = VALID_NIVEAUX.find(v => v.toLowerCase() === lower)
    if (found) return found
    const aliases = {
      'ami': 'Ami',
      'famille': 'Cercle familial',
      'cercle familial': 'Cercle familial',
      'collègue': 'Ancien collègue',
      'collegue': 'Ancien collègue',
      'ancien collègue': 'Ancien collègue',
      'ancien collegue': 'Ancien collègue',
      'alumni': 'Alumni',
      'partenaire': 'Partenaire business',
      'partenaire business': 'Partenaire business',
      'connaissance': 'Connaissance',
      'inconnu': 'Inconnu',
      'non renseigné': 'Non renseigné',
      'non renseigne': 'Non renseigné',
      'non renseignã©': 'Non renseigné',
    }
    if (aliases[lower]) return aliases[lower]
  }
  return null
}

// Corrige les noms de contacts dont l'encodage est cassé (UTF-8 lu en Latin-1)
function fixEncoding(val) {
  if (!val) return val
  try {
    const fixed = Buffer.from(String(val), 'latin1').toString('utf8')
    // Heuristique : si le fix donne plus de chars ASCII standard, l'appliquer
    const asciiScore = (str) => str.split('').filter(c => c.charCodeAt(0) < 128).length
    return asciiScore(fixed) >= asciiScore(String(val)) ? fixed : String(val)
  } catch {
    return String(val)
  }
}

// (pas d'appel réseau — le script génère un fichier SQL à exécuter manuellement)

// ── Lecture du fichier ────────────────────────────────────────────────────────

// Pour CSV : forcer UTF-8. Pour xlsx : lecture standard.
const isCsv = filePath.toLowerCase().endsWith('.csv')
let rows

if (isCsv) {
  const content = fs.readFileSync(path.resolve(filePath), 'utf-8')
  const wb = XLSX.read(content, { type: 'string' })
  rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
} else {
  const wb = XLSX.readFile(path.resolve(filePath))
  rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
}

if (rows.length === 0) {
  console.error('Le fichier est vide ou mal formaté.')
  process.exit(1)
}

const headers = Object.keys(rows[0])
console.log(`Colonnes détectées : ${headers.join(', ')}\n`)

// Colonne niveau : "Niveau de relation" exactement (pas "Niveau de relation business")
const colNiveau   = findCol(headers, 'Niveau de relation', 'niveau_de_relation')
const colPrenom   = findCol(headers, 'Prénom', 'prenom', 'first_name', 'firstName', 'First Name')
const colNom      = findCol(headers, 'Nom', 'nom', 'last_name', 'lastName', 'Last Name')
const colFullName = findCol(headers, 'full_name', 'Full Name', 'Nom complet', 'Name')

if (!colNiveau) {
  console.error(`Colonne "Niveau de relation" introuvable. Colonnes : ${headers.join(', ')}`)
  process.exit(1)
}
if (!colPrenom && !colNom && !colFullName) {
  console.error(`Colonnes de nom introuvables. Colonnes : ${headers.join(', ')}`)
  process.exit(1)
}

console.log(`Membre Digi   : ${membreArg}`)
console.log(`Fichier       : ${filePath}`)
console.log(`Lignes lues   : ${rows.length}`)
console.log(`Col. niveau   : ${colNiveau}`)
console.log(`Col. contact  : ${colFullName ?? `"${colPrenom}" + "${colNom}"`}`)
console.log()

// ── Construction des mises à jour ─────────────────────────────────────────────

const updates = []
const skipped = []

for (const row of rows) {
  let fullName
  if (colFullName) {
    fullName = fixEncoding(String(row[colFullName] ?? '')).trim()
  } else {
    const prenom = fixEncoding(String(row[colPrenom] ?? '')).trim()
    const nom    = fixEncoding(String(row[colNom]    ?? '')).trim()
    fullName = `${prenom} ${nom}`.trim()
  }

  const rawNiveau = row[colNiveau]
  const niveau = normalizeNiveau(rawNiveau)

  if (!fullName) {
    skipped.push({ fullName: '(vide)', rawNiveau, reason: 'Nom vide' })
    continue
  }
  if (!niveau) {
    skipped.push({ fullName, rawNiveau, reason: `Valeur non reconnue : "${rawNiveau}"` })
    continue
  }
  if (niveau === 'Non renseigné') {
    skipped.push({ fullName, rawNiveau, reason: 'Non renseigné — ignoré' })
    continue
  }

  updates.push({ fullName, niveau })
}

console.log(`À mettre à jour : ${updates.length}`)
if (skipped.length > 0) {
  console.log(`Ignorées        : ${skipped.length}`)
  skipped.forEach(s => console.log(`  ⚠  ${s.fullName} — ${s.reason}`))
}

if (updates.length === 0) {
  console.log('\nRien à mettre à jour.')
  process.exit(0)
}

// ── Génération SQL ────────────────────────────────────────────────────────────

const statements = updates.map(({ fullName, niveau }) =>
  `UPDATE contacts_membres_relations
SET niveau_de_relation = ${escSql(niveau)}
WHERE membre_id = (SELECT id FROM membres_digilityx WHERE full_name = ${escSql(membreArg)} LIMIT 1)
  AND contact_id = (SELECT id FROM contacts WHERE LOWER(full_name) = LOWER(${escSql(fullName)}) LIMIT 1)
  AND contact_id IS NOT NULL;`
)

// ── Aperçu + confirmation ─────────────────────────────────────────────────────

console.log('\nModifications prévues :')
updates.forEach(({ fullName, niveau }) =>
  console.log(`  • ${fullName.padEnd(40)} → ${niveau}`)
)

console.log(`\n${updates.length} ligne(s) seront mises à jour pour "${membreArg}".`)

const { createInterface } = await import('readline')
const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await new Promise(resolve => rl.question('\nConfirmer et générer le SQL ? (o/n) : ', resolve))
rl.close()

if (answer.trim().toLowerCase() !== 'o') {
  console.log('Annulé.')
  process.exit(0)
}

// ── Génération du fichier SQL ─────────────────────────────────────────────────

const outDir = 'scripts/generated-sql'
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const outFile = path.join(outDir, `import_niveau_relation_${membreArg.replace(/\s+/g, '_')}.sql`)
const sql = statements.join('\n\n')
fs.writeFileSync(outFile, sql, 'utf-8')

console.log(`\n✓ Fichier SQL généré : ${outFile}`)
console.log(`\nPour appliquer :`)
console.log(`  1. Ouvre https://supabase.com/dashboard/project/_/sql`)
console.log(`  2. Colle le contenu du fichier et clique sur "Run"`)
