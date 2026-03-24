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
const MCP_CONFIG = JSON.parse(fs.readFileSync('.mcp.json', 'utf-8'))
const ACCESS_TOKEN = MCP_CONFIG.mcpServers.supabase.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = MCP_CONFIG.mcpServers.supabase.env.SUPABASE_PROJECT_REF

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

  // Only run remaining relation enrichment files (32-48)
  const toRun = files.filter(f => {
    if (!f.startsWith('enrich_relations_')) return false
    const num = parseInt(f.match(/(\d+)/)?.[1] ?? '0')
    return num >= 32
  })

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
