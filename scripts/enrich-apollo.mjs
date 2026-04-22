/**
 * enrich-apollo.mjs
 *
 * Enrichit les entreprises sans taille via l'API Apollo.io.
 * Étape 1: Search par nom → récupère le domaine
 * Étape 2: Enrich par domaine → récupère employee_count, industry, etc.
 *
 * Usage:
 *   APOLLO_API_KEY=xxx node scripts/enrich-apollo.mjs
 *
 * Options:
 *   --limit=500    Nombre max d'entreprises à traiter (default: 500)
 *   --dry-run      Afficher sans écrire en BDD
 *   --offset=0     Offset pour paginer entre les runs
 */

const APOLLO_API_KEY = process.env.APOLLO_API_KEY

if (!APOLLO_API_KEY) {
  console.error('Missing APOLLO_API_KEY env var')
  console.error('Usage: APOLLO_API_KEY=xxx node scripts/enrich-apollo.mjs')
  process.exit(1)
}

const args = process.argv.slice(2)
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '500')
const offset = parseInt(args.find(a => a.startsWith('--offset='))?.split('=')[1] ?? '0')
const dryRun = args.includes('--dry-run')

// Use Supabase Management API via MCP is not possible from script,
// so we use the REST API with the service role key or anon key.
// Since RLS blocks anon, we'll read from a pre-exported file and write SQL.

import { readFileSync, writeFileSync } from 'fs'

// Load .env
const envContent = readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY

async function apolloSearch(companyName) {
  const resp = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
    body: JSON.stringify({ q_organization_name: companyName, page: 1, per_page: 1 }),
  })
  if (!resp.ok) throw new Error(`Search API ${resp.status}`)
  const data = await resp.json()
  const orgs = data.organizations || data.accounts || []
  return orgs[0] || null
}

async function apolloEnrich(domain) {
  const resp = await fetch('https://api.apollo.io/api/v1/organizations/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
    body: JSON.stringify({ domain }),
  })
  if (!resp.ok) throw new Error(`Enrich API ${resp.status}`)
  const data = await resp.json()
  return data.organization || null
}

function formatRange(count) {
  if (!count) return null
  if (count >= 10000) return '10000+'
  if (count >= 5000) return '5001-10000'
  if (count >= 1000) return '1001-5000'
  if (count >= 500) return '501-1000'
  if (count >= 200) return '201-500'
  if (count >= 50) return '51-200'
  if (count >= 11) return '11-50'
  if (count >= 2) return '2-10'
  return '1'
}

function deriveTypology(count) {
  if (!count) return null
  if (count >= 5000) return 'Grand Groupe'
  if (count >= 250) return 'ETI'
  if (count >= 10) return 'PME'
  if (count >= 1) return 'TPE'
  return null
}

function escSql(val) {
  if (val === null || val === undefined) return 'NULL'
  const s = String(val).replace(/'/g, "''").replace(/\n/g, ' ')
  return `'${s}'`
}

async function main() {
  // Fetch entreprises via Supabase REST (will work if RLS allows select for anon)
  // If not, we'll use a pre-generated list
  console.log(`Fetching entreprises (offset=${offset}, limit=${limit})...`)

  const url = `${SUPABASE_URL}/rest/v1/entreprises?select=id,company_name&company_employee_count=is.null&order=company_name&offset=${offset}&limit=${limit}`
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })

  if (!resp.ok) {
    console.error(`Failed to fetch entreprises: ${resp.status}`)
    process.exit(1)
  }

  const entreprises = await resp.json()
  console.log(`Found ${entreprises.length} entreprises to enrich\n`)

  const updates = [] // SQL updates to generate
  let enriched = 0
  let notFound = 0
  let errors = 0

  for (let i = 0; i < entreprises.length; i++) {
    const e = entreprises[i]
    const pct = ((i + 1) / entreprises.length * 100).toFixed(0)

    try {
      // Step 1: Search by name to get domain
      const searchResult = await apolloSearch(e.company_name)
      await sleep(150)

      if (!searchResult) {
        notFound++
        logProgress(pct, i + 1, entreprises.length, e.company_name, 'not found (search)')
        continue
      }

      const domain = searchResult.primary_domain || searchResult.website_url?.replace(/https?:\/\//, '').replace(/\/$/, '')

      if (!domain) {
        notFound++
        logProgress(pct, i + 1, entreprises.length, e.company_name, 'no domain')
        continue
      }

      // Step 2: Enrich by domain
      const org = await apolloEnrich(domain)
      await sleep(150)

      const empCount = org?.estimated_num_employees
      if (!empCount) {
        notFound++
        logProgress(pct, i + 1, entreprises.length, e.company_name, `domain=${domain}, no employee data`)
        // Still save domain/website if found
        if (domain) {
          updates.push(`UPDATE entreprises SET company_domain = ${escSql(domain)}, company_website = ${escSql(org?.website_url)} WHERE id = ${escSql(e.id)};`)
        }
        continue
      }

      const typology = deriveTypology(empCount)
      const range = formatRange(empCount)

      const setClauses = [
        `company_employee_count = ${empCount}`,
        `company_employee_range = ${escSql(range)}`,
      ]
      if (typology) setClauses.push(`company_typology = ${escSql(typology)}`)
      if (domain) setClauses.push(`company_domain = ${escSql(domain)}`)
      if (org?.website_url) setClauses.push(`company_website = ${escSql(org.website_url)}`)
      if (org?.short_description) setClauses.push(`company_description = ${escSql(org.short_description.slice(0, 500))}`)
      if (org?.industry) setClauses.push(`linkedin_industry = COALESCE(linkedin_industry, ${escSql(org.industry)})`)

      updates.push(`UPDATE entreprises SET ${setClauses.join(', ')} WHERE id = ${escSql(e.id)};`)
      enriched++

      logProgress(pct, i + 1, entreprises.length, e.company_name, `${empCount} emp → ${typology}`)

    } catch (err) {
      errors++
      console.error(`\n  Error for ${e.company_name}: ${err.message}`)
      await sleep(2000)
    }
  }

  // Write SQL file
  if (updates.length > 0) {
    const sqlFile = `scripts/generated-sql/apollo-enrich-${Date.now()}.sql`
    writeFileSync(sqlFile, updates.join('\n'))
    console.log(`\nSQL file written: ${sqlFile} (${updates.length} updates)`)

    if (!dryRun) {
      console.log('Executing updates via Supabase REST...')
      // Execute in batches of 50 via individual updates
      let applied = 0
      for (const sql of updates) {
        try {
          // Use RPC or individual PATCH calls
          const match = sql.match(/WHERE id = '([^']+)'/)
          const setMatch = sql.match(/SET (.+) WHERE/)
          if (match && setMatch) {
            const id = match[1]
            // Parse SET clauses into object
            const pairs = setMatch[1].split(', ').map(p => {
              const [key, ...valParts] = p.split(' = ')
              let val = valParts.join(' = ')
              if (val === 'NULL') return [key.trim(), null]
              if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/''/g, "'")
              else if (!isNaN(val)) val = Number(val)
              // Skip COALESCE expressions for REST
              if (val.toString().startsWith('COALESCE')) return null
              return [key.trim(), val]
            }).filter(Boolean)

            const body = Object.fromEntries(pairs)
            const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/entreprises?id=eq.${id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                Prefer: 'return=minimal',
              },
              body: JSON.stringify(body),
            })
            if (patchResp.ok) applied++
          }
        } catch (e) { /* ignore individual errors */ }
      }
      console.log(`Applied ${applied}/${updates.length} updates`)
    }
  }

  console.log(`\nDone!`)
  console.log(`  Enriched: ${enriched}`)
  console.log(`  Not found: ${notFound}`)
  console.log(`  Errors: ${errors}`)
  console.log(`  SQL updates generated: ${updates.length}`)
}

function logProgress(pct, current, total, name, status) {
  process.stdout.write(`\r[${pct}%] ${current}/${total} — ${name.slice(0, 30).padEnd(30)} ${status}`)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

main()
