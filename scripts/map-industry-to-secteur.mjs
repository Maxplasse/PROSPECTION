/**
 * map-industry-to-secteur.mjs
 *
 * Maps LinkedIn industry values to Digilityx secteur_digi using keyword rules.
 * Generates SQL to update entreprises.secteur_digi.
 *
 * Usage: node scripts/map-industry-to-secteur.mjs
 */

import fs from 'fs'
import path from 'path'

// ── Mapping rules: keyword patterns → secteur_digi ───────────────────
// Order matters: first match wins. More specific patterns come first.

const RULES = [
  // Pharma/Santé
  { secteur: 'Pharma/Santé', patterns: [
    /pharma/i, /biotech/i, /médic/i, /medic/i, /santé/i, /health/i,
    /hôpita/i, /hospit/i, /médec/i, /clinic/i, /wellness/i, /mental/i,
    /dentaire/i, /dental/i, /vétérin/i, /veterinar/i, /nursing/i,
    /soins/i, /optical/i, /optique/i, /chirurg/i, /dispositifs? médica/i,
    /medical device/i, /medical equipment/i, /medical practice/i,
    /alternative medicine/i, /médecine alternative/i,
  ]},

  // Education
  { secteur: 'Education', patterns: [
    /education/i, /enseignement/i, /universitai?r/i, /universit[yé]/i,
    /e-learning/i, /elearning/i, /training/i, /formation/i,
    /école/i, /school/i, /coaching/i, /développement professionnel/i,
    /professional training/i, /higher education/i, /enseignement supérieur/i,
    /research/i, /recherche/i, /académi/i, /academi/i,
  ]},

  // Recrutement
  { secteur: 'Recrutement', patterns: [
    /recruit/i, /recrutement/i, /staffing/i, /placement/i,
    /human resources/i, /ressources humaines/i, /talent/i, /hiring/i,
    /executive search/i, /outplacement/i, /intérim/i, /interim/i,
  ]},

  // Tourisme/Loisir
  { secteur: 'Tourisme/Loisir', patterns: [
    /touris/i, /hôtel/i, /hotel/i, /hospit.*industry/i, /hospitality/i,
    /restaur/i, /loisir/i, /leisure/i, /entertainment/i, /divertissement/i,
    /événement/i, /event/i, /spectacle/i, /performing arts/i, /arts du spectacle/i,
    /gaming/i, /jeux/i, /casino/i, /sports?$/i, /sporting/i, /fitness/i,
    /recreation/i, /amusement/i, /music/i, /musique/i, /arts?$/i,
    /animation/i, /wine/i, /food.*bever/i, /alimentaire/i,
    /travel/i, /voyage/i,
  ]},

  // Luxe
  { secteur: 'Luxe', patterns: [
    /luxe/i, /luxury/i, /joaill/i, /jewel/i, /horlog/i, /watch/i,
    /fashion/i, /mode /i, /couture/i, /maroquin/i, /leather/i,
    /cosmét/i, /cosmet/i, /parfum/i, /fragrance/i, /beauté/i, /beauty/i,
    /habillement/i, /apparel/i, /textile/i,
  ]},

  // Immobilier
  { secteur: 'Immobilier', patterns: [
    /immobili/i, /real estate/i, /property/i, /foncier/i,
    /construction/i, /bâtiment/i, /building/i, /architect/i,
    /civil engineer/i, /génie civil/i, /urbanis/i,
  ]},

  // Transports/Logistique
  { secteur: 'Transports/Logistique', patterns: [
    /transport/i, /logisti/i, /supply chain/i, /chaîne d'approvisionnement/i,
    /shipping/i, /maritime/i, /aviation/i, /aéronaut/i, /aérien/i,
    /airline/i, /railroad/i, /ferroviaire/i, /freight/i, /fret/i,
    /warehousing/i, /entreposage/i, /delivery/i, /livraison/i,
    /automobile/i, /automotive/i, /véhicule/i, /vehicle/i, /motor/i,
  ]},

  // BAF (Banque, Assurance, Finance)
  { secteur: 'BAF', patterns: [
    /banqu/i, /bank/i, /assurance/i, /insurance/i, /financ/i,
    /invest/i, /capital/i, /venture/i, /fonds?$/i, /fund/i,
    /crédit/i, /credit/i, /comptab/i, /account/i, /audit/i,
    /fiduciaire/i, /bourse/i, /stock/i, /trading/i, /fintech/i,
    /payment/i, /paiement/i,
  ]},

  // Grande distribution
  { secteur: 'Grande distribution', patterns: [
    /grande distribution/i, /supermar/i, /hypermar/i, /grocery/i,
    /commerce de détail(?! d'habillement)/i, /retail(?! apparel)/i,
    /wholesale/i, /gros/i, /consumer goods/i, /biens de consommation/i,
    /distribution/i,
  ]},

  // e-commerce
  { secteur: 'e-commerce', patterns: [
    /e-commerce/i, /ecommerce/i, /commerce en ligne/i, /online.*retail/i,
    /marketplace/i, /place de marché/i,
  ]},

  // Tech
  { secteur: 'Tech', patterns: [
    /software/i, /logiciel/i, /saas/i, /cloud/i, /cyber/i,
    /intelligen.*artifici/i, /artificial intelligen/i, /machine learning/i,
    /data /i, /données/i, /blockchain/i, /crypto/i,
    /semiconductor/i, /semi-conducteur/i, /computer/i, /informatiq/i,
    /internet/i, /web /i, /mobile/i, /app/i, /plateforme/i, /platform/i,
    /it service/i, /it consult/i, /information tech/i,
    /technolog/i, /télécom/i, /telecom/i, /network/i, /réseau/i,
    /electronic/i, /électroniq/i, /hardware/i, /matériel/i,
    /robotiq/i, /robotic/i, /iot/i, /embedded/i,
    /développement de logiciels/i, /services et conseil en informatique/i,
    /technologie, information/i,
  ]},

  // Service B2B
  { secteur: 'Service B2B', patterns: [
    /consult/i, /conseil/i, /agenc/i, /stratég/i, /strateg/i,
    /marketing/i, /publicité/i, /advertis/i, /design/i, /créati/i,
    /communic/i, /média/i, /media/i, /pr /i, /relation.*publi/i,
    /public.*relation/i, /outsourc/i, /externalisation/i,
    /managed service/i, /professional service/i, /services professionnel/i,
    /business.*service/i, /services.*entreprise/i, /legal/i, /juridi/i,
    /avocat/i, /law /i, /cabinet/i, /notai?r/i, /traduction/i, /translat/i,
    /graphi/i, /print/i, /imprim/i, /writing/i, /rédact/i,
    /market research/i, /étude.*marché/i, /sondage/i,
    /facilities/i, /cleaning/i, /sécurité/i, /security service/i,
    /services et conseil aux entreprises/i, /services de publicité/i,
    /services de marketing/i, /services de design/i,
  ]},

  // Service (B2C / général)
  { secteur: 'Service', patterns: [
    /service/i, /civic/i, /civique/i, /nonprofit/i, /association/i,
    /gouvern/i, /government/i, /administra.*publi/i, /public.*admin/i,
    /international.*affair/i, /affaires.*international/i,
    /humanitaire/i, /humanitarian/i, /ngo/i, /ong/i,
    /environn/i, /renouvel/i, /renewable/i, /énergie/i, /energy/i,
    /pétrole/i, /oil/i, /gas /i, /gaz /i, /mining/i, /mines/i,
    /agricul/i, /farming/i, /forestry/i, /pêche/i, /fishing/i,
    /défense/i, /defen[cs]e/i, /military/i, /militair/i,
  ]},
]

// ── Load industries from Excel ──────────────────────────────────────

const XLSX = (await import('xlsx')).default
const files = fs.readdirSync('seed').filter(f => f.endsWith('.xlsx'))
const companyIndustry = {}

for (const f of files) {
  const wb = XLSX.readFile(path.join('seed', f))
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
  data.forEach(r => {
    if (r.industry && r.companyId) {
      companyIndustry[String(r.companyId)] = r.industry
    }
  })
}

// ── Apply mapping ───────────────────────────────────────────────────

function mapIndustry(industry) {
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(industry)) return rule.secteur
    }
  }
  return null
}

const mapped = {}
const unmapped = {}
let mappedCount = 0
let unmappedCount = 0

for (const [companyId, industry] of Object.entries(companyIndustry)) {
  const secteur = mapIndustry(industry)
  if (secteur) {
    mapped[companyId] = secteur
    mappedCount++
  } else {
    unmapped[industry] = (unmapped[industry] || 0) + 1
    unmappedCount++
  }
}

console.log(`Mapped: ${mappedCount} / ${Object.keys(companyIndustry).length}`)
console.log(`Unmapped: ${unmappedCount}`)

// Show unmapped
const unmappedSorted = Object.entries(unmapped).sort((a, b) => b[1] - a[1])
if (unmappedSorted.length > 0) {
  console.log(`\nUnmapped industries (${unmappedSorted.length} unique):`)
  unmappedSorted.forEach(([k, v]) => console.log(`  ${v}x  ${k}`))
}

// Show distribution
const dist = {}
Object.values(mapped).forEach(s => { dist[s] = (dist[s] || 0) + 1 })
console.log('\nDistribution:')
Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`))

// ── Generate SQL ────────────────────────────────────────────────────

function escSql(v) { return v.replace(/'/g, "''") }

const OUT_DIR = 'scripts/generated-sql'
const entries = Object.entries(mapped)
const BATCH = 500
let fileIdx = 0

for (let i = 0; i < entries.length; i += BATCH) {
  fileIdx++
  const batch = entries.slice(i, i + BATCH)
  const cases = batch.map(([cid, secteur]) =>
    `WHEN '${escSql(cid)}' THEN '${escSql(secteur)}'`
  ).join('\n')
  const ids = batch.map(([cid]) => `'${escSql(cid)}'`).join(',')

  const sql = `UPDATE entreprises SET secteur_digi = CASE company_id_linkedin\n${cases}\nEND\nWHERE company_id_linkedin IN (${ids}) AND secteur_digi IS NULL;\n`
  fs.writeFileSync(path.join(OUT_DIR, `secteur_${String(fileIdx).padStart(2, '0')}.sql`), sql)
}

console.log(`\nGenerated ${fileIdx} SQL files`)
