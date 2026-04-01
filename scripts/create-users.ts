/**
 * Script pour créer les utilisateurs Supabase Auth pour chaque membre Digi.
 *
 * Usage: npx tsx scripts/create-users.ts
 *
 * Nécessite SUPABASE_SERVICE_ROLE_KEY en env.
 * Trouver dans: Supabase Dashboard > Settings > API > service_role
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pcxcdhhxnqbxfrqxnikj.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env var first.')
  console.error('Find it in: Supabase Dashboard > Settings > API > service_role (secret)')
  console.error('')
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/create-users.ts')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const PASSWORD = 'Digilityx2026!'

async function main() {
  // Fetch all membres
  const { data: membres, error } = await supabase
    .from('membres_digilityx')
    .select('id, full_name, email, role')
    .order('full_name')

  if (error || !membres) {
    console.error('Failed to fetch membres:', error?.message)
    process.exit(1)
  }

  console.log(`Found ${membres.length} membres. Creating auth users...\n`)

  let created = 0
  let skipped = 0
  let errors = 0

  for (const m of membres) {
    if (!m.email) {
      console.log(`SKIP ${m.full_name} - no email`)
      skipped++
      continue
    }

    // Create user via admin API
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email: m.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: m.full_name, membre_id: m.id },
      app_metadata: { membre_role: m.role },
    })

    if (createError) {
      if (createError.message?.includes('already been registered')) {
        console.log(`SKIP ${m.full_name} (${m.email}) - already exists`)
        skipped++
      } else {
        console.error(`FAIL ${m.full_name} (${m.email}):`, createError.message)
        errors++
      }
      continue
    }

    // Link auth_user_id back to membre
    if (data.user) {
      await supabase
        .from('membres_digilityx')
        .update({ auth_user_id: data.user.id })
        .eq('id', m.id)
      console.log(`OK   ${m.full_name} (${m.email}) -> ${data.user.id}`)
      created++
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${errors} errors`)
}

main()
