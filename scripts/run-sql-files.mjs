/**
 * run-sql-files.mjs
 *
 * Executes all generated SQL files against Supabase in order.
 * Uses the Supabase Management API with the access token from .mcp.json.
 *
 * Usage: node scripts/run-sql-files.mjs
 */

import fs from 'fs'
import path from 'path'

const SQL_DIR = 'scripts/generated-sql'

// Lire les credentials depuis .mcp.json ou variables d'environnement
let ACCESS_TOKEN, PROJECT_REF
if (fs.existsSync('.mcp.json')) {
  const MCP_CONFIG = JSON.parse(fs.readFileSync('.mcp.json', 'utf-8'))
  ACCESS_TOKEN = MCP_CONFIG.mcpServers?.supabase?.env?.SUPABASE_ACCESS_TOKEN
  PROJECT_REF = MCP_CONFIG.mcpServers?.supabase?.env?.SUPABASE_PROJECT_REF
}
ACCESS_TOKEN = ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN
PROJECT_REF = PROJECT_REF || process.env.SUPABASE_PROJECT_REF

if (!ACCESS_TOKEN || !PROJECT_REF) {
  console.error('Credentials manquants. Définissez SUPABASE_ACCESS_TOKEN et SUPABASE_PROJECT_REF :')
  console.error('  export SUPABASE_ACCESS_TOKEN=<votre-token>')
  console.error('  export SUPABASE_PROJECT_REF=<votre-project-ref>')
  console.error('Ou créez un fichier .mcp.json avec ces valeurs.')
  process.exit(1)
}

async function executeSql(sql, filename) {
  const resp = await fetch(
    `https://${PROJECT_REF}.supabase.co/rest/v1/rpc`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  )
  // Actually, we need to use the Management API or direct pg connection
  // The Management API endpoint for SQL execution:
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  return await response.json()
}

async function main() {
  const files = fs.readdirSync(SQL_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const prefix = process.argv[2] ?? 'enrich_entreprises_'
  const toRun = files.filter(f => f.startsWith(prefix))

  console.log(`${toRun.length} SQL files to execute\n`)

  for (const file of toRun) {
    const sql = fs.readFileSync(path.join(SQL_DIR, file), 'utf-8')
    const sizeMB = (sql.length / 1024 / 1024).toFixed(2)
    process.stdout.write(`${file} (${sizeMB} MB)... `)

    try {
      await executeSql(sql, file)
      console.log('OK')
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
      process.exit(1)
    }
  }

  console.log('\nAll done!')
}

main()
