/**
 * import-phantombuster-companies.mjs
 *
 * Importe les résultats du Phantombuster Company Scraper
 * et met à jour les entreprises en BDD.
 *
 * Usage:
 *   node scripts/import-phantombuster-companies.mjs --file=seed/result-company-scraper.csv
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

if (!filePath) {
  console.error('Usage: node scripts/import-phantombuster-companies.mjs --file=result.csv')
  process.exit(1)
}

function deriveTypology(count) {
  if (!count) return null
  if (count >= 5000) return 'Grand Groupe'
  if (count >= 250) return 'ETI'
  if (count >= 10) return 'PME'
  if (count >= 1) return 'TPE'
  return null
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

async function main() {
  const content = readFileSync(filePath, 'utf8')
  const rows = parse(content, { columns: true, skip_empty_lines: true })
  console.log(`Read ${rows.length} rows from ${filePath}`)

  let updated = 0
  let notFound = 0
  let errors = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]

    // Phantombuster Company Scraper typical columns:
    // companyUrl, companyName, employeeCount, industry, website, description, specialties, ...
    const companyUrl = r.companyUrl || r.linkedInUrl || r.link || ''
    const match = companyUrl.match(/company\/(\d+)/)
    const companyIdLinkedin = match ? match[1] : (r.companyId || null)

    if (!companyIdLinkedin) {
      errors++
      continue
    }

    const employeeCount = parseInt(r.employeeCount || r.staffCount || r.employeesOnLinkedIn || '0') || null
    const industry = r.industry || null
    const website = r.website || r.websiteUrl || null
    const description = r.description || r.tagline || null
    const specialties = r.specialties || null

    if (!employeeCount) {
      notFound++
      continue
    }

    const updateData = {
      company_employee_count: employeeCount,
      company_employee_range: formatRange(employeeCount),
      company_typology: deriveTypology(employeeCount),
    }
    if (industry) updateData.linkedin_industry = industry
    if (website) updateData.company_website = website
    if (description) updateData.company_description = description.slice(0, 500)
    if (specialties) updateData.company_specialties = specialties.slice(0, 500)

    // Extract domain from website
    if (website) {
      try {
        const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace('www.', '')
        updateData.company_domain = domain
      } catch {}
    }

    const { error } = await supabase
      .from('entreprises')
      .update(updateData)
      .eq('company_id_linkedin', companyIdLinkedin)

    if (error) {
      errors++
      if (errors <= 5) console.error(`  Error for ${companyIdLinkedin}: ${error.message}`)
    } else {
      updated++
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${rows.length} processed (${updated} updated)`)
    }
  }

  console.log(`\nDone!`)
  console.log(`  Updated: ${updated}`)
  console.log(`  No employee data: ${notFound}`)
  console.log(`  Errors: ${errors}`)
}

main()
