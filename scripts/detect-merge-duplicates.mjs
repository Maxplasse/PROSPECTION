/**
 * detect-merge-duplicates.mjs
 *
 * Détecte les contacts en doublon (même first_name + last_name) et les fusionne.
 *
 * Mode détection (défaut) :
 *   node scripts/detect-merge-duplicates.mjs
 *   → affiche les groupes de doublons sans rien modifier
 *
 * Mode fusion automatique :
 *   node scripts/detect-merge-duplicates.mjs --merge
 *   → pour chaque groupe, conserve l'entrée la plus complète (score de complétude),
 *     transfère toutes les relations vers elle, supprime les doublons
 *
 * Mode fusion interactif (recommandé) :
 *   node scripts/detect-merge-duplicates.mjs --merge --interactive
 *   → affiche chaque groupe en détail et demande quel contact garder
 *     avant de fusionner. Entrée vide = accepter le choix automatique.
 *     's' = skip ce groupe sans fusionner.
 *
 * Options :
 *   --search="Antoine Guenancia"  → filtre sur un nom en particulier
 *   --dry-run                     → simule la fusion sans rien modifier
 */

import { readFileSync } from 'fs'
import { createInterface } from 'readline'
import { createClient } from '@supabase/supabase-js'

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

const envContent = readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY)

const cliArgs = process.argv.slice(2)
const doMerge = cliArgs.includes('--merge')
const dryRun = cliArgs.includes('--dry-run')
const interactive = cliArgs.includes('--interactive')
const searchArg = cliArgs.find(a => a.startsWith('--search='))?.split('=').slice(1).join('=')

// ── 1. Récupérer tous les contacts (ou filtrer par nom) ───────────────
console.log('🔍 Chargement des contacts...')

let query = supabase
  .from('contacts')
  .select('id, first_name, last_name, full_name, position, company_name, linkedin_url, id_url_linkedin, email, persona, hierarchie, statut_contact, niveau_de_relation, scoring, contact_digi, entreprise_id, owner_membre_id, created_at')
  .eq('masque', false)
  .order('created_at', { ascending: true })

if (searchArg) {
  const parts = searchArg.trim().split(/\s+/)
  if (parts.length >= 2) {
    query = query.ilike('first_name', `%${parts[0]}%`).ilike('last_name', `%${parts.slice(1).join(' ')}%`)
  } else {
    query = query.or(`first_name.ilike.%${searchArg}%,last_name.ilike.%${searchArg}%`)
  }
}

// Paginer pour récupérer tous les contacts
const allContacts = []
let page = 0
while (true) {
  const { data, error } = await query.range(page * 1000, (page + 1) * 1000 - 1)
  if (error) { console.error('❌ Erreur fetch contacts:', error.message); process.exit(1) }
  if (!data || data.length === 0) break
  allContacts.push(...data)
  if (data.length < 1000) break
  page++
}

console.log(`  ${allContacts.length} contacts chargés\n`)

// ── 2. Grouper par (first_name + last_name) normalisé ────────────────
function normalizeName(s) {
  if (!s) return ''
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

const groups = new Map() // "prenom nom" -> contact[]
for (const c of allContacts) {
  const key = `${normalizeName(c.first_name)} ${normalizeName(c.last_name)}`
  if (!key.trim()) continue
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(c)
}

const duplicateGroups = [...groups.entries()].filter(([, contacts]) => contacts.length > 1)
console.log(`📊 ${duplicateGroups.length} groupe(s) de doublons détectés\n`)

if (duplicateGroups.length === 0) {
  console.log('✅ Aucun doublon trouvé.')
  process.exit(0)
}

// ── 3. Afficher les doublons ──────────────────────────────────────────
for (const [name, contacts] of duplicateGroups) {
  console.log(`\n👥 ${name.toUpperCase()} (${contacts.length} entrées)`)
  for (const c of contacts) {
    const fields = [
      c.id.slice(0, 8),
      c.position || '(sans poste)',
      c.company_name || '(sans entreprise)',
      c.linkedin_url ? '🔗 linkedin' : '(sans URL)',
      c.id_url_linkedin ? `ACW:${c.id_url_linkedin.slice(0, 10)}` : '(sans ACW)',
      c.email || '',
      `score:${c.scoring ?? 0}`,
      c.statut_contact || '',
      c.created_at?.slice(0, 10),
    ].filter(Boolean).join(' | ')
    console.log(`  • ${fields}`)
  }
}

if (!doMerge) {
  console.log(`\n💡 Pour fusionner : node scripts/detect-merge-duplicates.mjs --merge [--dry-run]`)
  process.exit(0)
}

// ── 4. Fusion ─────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`)
console.log(`🔀 FUSION${dryRun ? ' (DRY RUN)' : ''}`)
console.log(`${'═'.repeat(60)}`)

function scoringCompleteness(c) {
  // Score de complétude : plus un contact a de champs remplis, plus il est conservé
  let score = 0
  if (c.linkedin_url) score += 10
  if (c.id_url_linkedin) score += 10
  if (c.email) score += 5
  if (c.persona) score += 3
  if (c.hierarchie) score += 3
  if (c.statut_contact) score += 3
  if (c.contact_digi) score += 2
  if (c.entreprise_id) score += 5
  if (c.position) score += 2
  if (c.company_name) score += 2
  score += (c.scoring ?? 0) / 10  // bonus scoring applicatif
  return score
}

let totalMerged = 0
let totalDeleted = 0
let totalRelationsMoved = 0

function displayContact(c, index, isAutoKeeper) {
  const label = isAutoKeeper ? ' ← choix auto' : ''
  console.log(`\n  [${index + 1}]${label}`)
  console.log(`      ID           : ${c.id}`)
  console.log(`      Poste        : ${c.position || '—'}`)
  console.log(`      Entreprise   : ${c.company_name || '—'}`)
  console.log(`      LinkedIn URL : ${c.linkedin_url || '—'}`)
  console.log(`      ACW ID       : ${c.id_url_linkedin || '—'}`)
  console.log(`      Email        : ${c.email || '—'}`)
  console.log(`      Persona      : ${c.persona || '—'}`)
  console.log(`      Hiérarchie   : ${c.hierarchie || '—'}`)
  console.log(`      Statut       : ${c.statut_contact || '—'}`)
  console.log(`      Relation     : ${c.niveau_de_relation || '—'}`)
  console.log(`      contact_digi : ${c.contact_digi ? 'oui' : 'non'}`)
  console.log(`      Scoring      : ${c.scoring ?? 0}`)
  console.log(`      Créé le      : ${c.created_at?.slice(0, 10)}`)
  console.log(`      Complétude   : ${scoringCompleteness(c).toFixed(1)} pts`)
}

for (const [name, contacts] of duplicateGroups) {
  // Trier par complétude décroissante — le premier est le choix automatique
  const sorted = [...contacts].sort((a, b) => scoringCompleteness(b) - scoringCompleteness(a))
  let keeper = sorted[0]
  let toDelete = sorted.slice(1)

  if (interactive && doMerge) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`👥 ${name.toUpperCase()} — ${sorted.length} entrées`)
    sorted.forEach((c, i) => displayContact(c, i, i === 0))
    console.log()

    let choice = await prompt(`  Garder lequel ? [1–${sorted.length}] (Entrée = choix auto, s = skip) : `)

    if (choice.toLowerCase() === 's') {
      console.log(`  ⏭  Skippé.`)
      continue
    }

    const idx = parseInt(choice) - 1
    if (!isNaN(idx) && idx >= 0 && idx < sorted.length && idx !== 0) {
      keeper = sorted[idx]
      toDelete = sorted.filter((_, i) => i !== idx)
      console.log(`  ✅ Choix manuel : keeper = ${keeper.id.slice(0, 8)}`)
    } else if (choice === '' || choice === '1') {
      console.log(`  ✅ Choix auto confirmé : keeper = ${keeper.id.slice(0, 8)}`)
    } else {
      console.log(`  ⚠️  Réponse non reconnue — skippé par sécurité.`)
      continue
    }
  } else {
    console.log(`\n👤 ${name}: garde ${keeper.id.slice(0, 8)} (complétude=${scoringCompleteness(keeper).toFixed(1)}), supprime ${toDelete.length}`)
  }

  for (const dup of toDelete) {
    console.log(`  🗑  doublon ${dup.id.slice(0, 8)} (score=${scoringCompleteness(dup).toFixed(1)})`)

    if (!dryRun) {
      // ── Transférer les relations en préservant le niveau_de_relation le plus riche ──
      // Colonnes réelles de contacts_membres_relations : membre_id, niveau_de_relation,
      // scoring (auto-trigger), entreprise_id (auto-trigger), company_name (auto-trigger).
      // On ne passe que membre_id + niveau_de_relation à l'insert : les triggers DB
      // remplissent scoring (depuis contacts.scoring) et company_name (depuis entreprises).
      const RELATION_RANK = {
        'Ami': 7, 'Cercle familial': 6, 'Ancien collègue': 5, 'Alumni': 5,
        'Partenaire business': 4, 'Connaissance': 3, 'Non renseigné': 1, 'Inconnu': 0,
      }

      // Récupérer les relations du doublon ET celles déjà sur le keeper
      const [{ data: dupRels }, { data: keeperRels }] = await Promise.all([
        supabase.from('contacts_membres_relations')
          .select('membre_id, niveau_de_relation')
          .eq('contact_id', dup.id),
        supabase.from('contacts_membres_relations')
          .select('membre_id, niveau_de_relation')
          .eq('contact_id', keeper.id),
      ])

      const keeperRelMap = new Map((keeperRels || []).map(r => [r.membre_id, r]))

      let relMoved = 0
      for (const rel of (dupRels || [])) {
        const existing = keeperRelMap.get(rel.membre_id)

        if (!existing) {
          // Pas encore de relation avec ce membre sur le keeper → on transfère.
          // On passe l'entreprise_id du keeper pour que le trigger company_name soit cohérent.
          const { error } = await supabase
            .from('contacts_membres_relations')
            .insert({ contact_id: keeper.id, membre_id: rel.membre_id, niveau_de_relation: rel.niveau_de_relation, entreprise_id: keeper.entreprise_id ?? null })
          if (!error) relMoved++
          else console.error(`    ❌ erreur transfert relation:`, error.message)
        } else {
          // Relation déjà présente → on garde le niveau_de_relation le plus riche
          const dupRank = RELATION_RANK[rel.niveau_de_relation] ?? -1
          const keepRank = RELATION_RANK[existing.niveau_de_relation] ?? -1
          if (dupRank > keepRank) {
            const { error } = await supabase
              .from('contacts_membres_relations')
              .update({ niveau_de_relation: rel.niveau_de_relation })
              .eq('contact_id', keeper.id)
              .eq('membre_id', rel.membre_id)
            if (!error) {
              console.log(`    → niveau_de_relation mis à jour pour membre ${rel.membre_id.slice(0, 8)}: "${existing.niveau_de_relation}" → "${rel.niveau_de_relation}"`)
            } else console.error(`    ❌ erreur update niveau_de_relation:`, error.message)
          }
        }
      }

      if (relMoved > 0) console.log(`    → ${relMoved} relation(s) transférée(s)`)
      totalRelationsMoved += relMoved

      // ── Supprimer les relations du doublon ──────────────────────────────
      // Nécessaire pour que le trigger recompute_contact_masque puisse
      // marquer le doublon comme masqué de façon stable (sinon il resterait
      // visible si ses relations pointaient vers des membres partageant leurs contacts).
      const { error: delRelsError } = await supabase
        .from('contacts_membres_relations')
        .delete()
        .eq('contact_id', dup.id)
      if (delRelsError) console.error(`    ❌ erreur suppression relations doublon:`, delRelsError.message)

      // ── Transférer scraping_snapshots vers le keeper ──────────────────
      // (affichés dans le ContactDrawer → important de les rattacher au bon contact)
      const { error: snapErr } = await supabase
        .from('scraping_snapshots')
        .update({ contact_id: keeper.id })
        .eq('contact_id', dup.id)
      if (snapErr) console.error(`    ❌ erreur transfert scraping_snapshots:`, snapErr.message)
      else console.log(`    → scraping_snapshots transférés vers keeper`)

      // ── Transférer notifications vers le keeper ────────────────────────
      // (les notifications pointant vers le doublon seraient orphelines sinon)
      const { error: notifErr } = await supabase
        .from('notifications')
        .update({ contact_id: keeper.id })
        .eq('contact_id', dup.id)
      if (notifErr) console.error(`    ❌ erreur transfert notifications:`, notifErr.message)

      // ── Fusionner les champs sur le keeper avec règles par champ ──
      // Le scoring est AUTO-calculé par trigger → ne jamais le patcher.
      // contacts.niveau_de_relation est CACHED par trigger depuis les relations → ne pas patcher.

      const HIERARCHIE_RANK = {
        'COMEX': 4, 'Directeur': 3, 'Manager': 2, 'Opérationnel': 1, 'Stagiaire/Alternant': 0,
      }
      const STATUT_RANK = {
        'Client': 5, 'Intéressé': 4, 'Contacté': 3, 'À contacter': 2, 'Pas intéressé': 1,
      }

      const patch = {}
      const conflicts = []

      // Champs simples : copier du doublon si le keeper n'a pas la valeur
      if (!keeper.email && dup.email) patch.email = dup.email
      if (!keeper.linkedin_url && dup.linkedin_url) patch.linkedin_url = dup.linkedin_url
      if (!keeper.id_url_linkedin && dup.id_url_linkedin) patch.id_url_linkedin = dup.id_url_linkedin
      if (!keeper.owner_membre_id && dup.owner_membre_id) patch.owner_membre_id = dup.owner_membre_id
      if (!keeper.entreprise_id && dup.entreprise_id) patch.entreprise_id = dup.entreprise_id
      if (!keeper.contact_digi && dup.contact_digi) patch.contact_digi = true

      // Comparer les postes pour savoir si on est face à un changement de job
      const samePosition = normalizeName(keeper.position || '') === normalizeName(dup.position || '')

      if (!samePosition && keeper.position && dup.position) {
        // Postes différents → probablement un changement de job entre deux imports.
        // On garde les données du contact le plus récent comme référence pour
        // hierarchie, statut_contact et persona (le poste actuel prime).
        const keeperDate = new Date(keeper.created_at || 0)
        const dupDate    = new Date(dup.created_at || 0)
        const ref = dupDate > keeperDate ? dup : keeper  // le plus récent

        conflicts.push(
          `postes différents : "${keeper.position}" (keeper, ${keeper.created_at?.slice(0, 10)}) ` +
          `vs "${dup.position}" (doublon, ${dup.created_at?.slice(0, 10)}) ` +
          `→ données de qualification issues du plus récent (${ref.created_at?.slice(0, 10)})`
        )

        if (ref === dup) {
          // Le doublon est plus récent → on prend sa qualification
          if (dup.hierarchie)     patch.hierarchie     = dup.hierarchie
          if (dup.statut_contact) patch.statut_contact = dup.statut_contact
          if (dup.persona)        patch.persona        = dup.persona
          if (dup.position)       patch.position       = dup.position
        }
        // Si le keeper est plus récent, on garde tout tel quel (rien à patcher)

      } else {
        // Même poste (ou l'un des deux est vide) → on peut comparer les valeurs

        // hierarchie : prend le rang le plus élevé
        if (dup.hierarchie) {
          if (!keeper.hierarchie) {
            patch.hierarchie = dup.hierarchie
          } else if (keeper.hierarchie !== dup.hierarchie) {
            const keepRank = HIERARCHIE_RANK[keeper.hierarchie] ?? -1
            const dupRank  = HIERARCHIE_RANK[dup.hierarchie]   ?? -1
            if (dupRank > keepRank) {
              patch.hierarchie = dup.hierarchie
              console.log(`    → hierarchie: "${keeper.hierarchie}" → "${dup.hierarchie}" (rang supérieur)`)
            }
          }
        }

        // statut_contact : prend le plus avancé
        if (dup.statut_contact) {
          if (!keeper.statut_contact) {
            patch.statut_contact = dup.statut_contact
          } else if (keeper.statut_contact !== dup.statut_contact) {
            const keepRank = STATUT_RANK[keeper.statut_contact] ?? -1
            const dupRank  = STATUT_RANK[dup.statut_contact]   ?? -1
            if (dupRank > keepRank) {
              patch.statut_contact = dup.statut_contact
              console.log(`    → statut_contact: "${keeper.statut_contact}" → "${dup.statut_contact}" (plus avancé)`)
            }
          }
        }

        // persona : pas de hiérarchie naturelle → conflit à signaler si les deux diffèrent
        if (dup.persona) {
          if (!keeper.persona) {
            patch.persona = dup.persona
          } else if (keeper.persona !== dup.persona) {
            conflicts.push(`persona: "${keeper.persona}" (keeper) vs "${dup.persona}" (doublon) → keeper conservé, à vérifier`)
          }
        }
      }

      if (conflicts.length > 0) {
        console.log(`    ⚠️  À vérifier manuellement :`)
        conflicts.forEach(c => console.log(`       • ${c}`))
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('contacts').update(patch).eq('id', keeper.id)
        if (!error) console.log(`    → champs enrichis: ${Object.keys(patch).join(', ')}`)
        else console.error(`    ❌ erreur patch keeper:`, error.message)
        Object.assign(keeper, patch)
      }

      // ── Recalculer nb_personnes_digi_relation → déclenche le trigger de scoring ──
      const { count: nbRel } = await supabase
        .from('contacts_membres_relations')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', keeper.id)

      if (nbRel !== null) {
        // Ce update déclenche trigger_contacts_auto_scoring qui recalcule scoring
        // à partir de hierarchie + persona + niveau_de_relation + nb_personnes_digi_relation.
        await supabase.from('contacts').update({ nb_personnes_digi_relation: nbRel }).eq('id', keeper.id)
        keeper.nb_personnes_digi_relation = nbRel
        console.log(`    → nb_personnes_digi_relation recalculé: ${nbRel} (scoring sera recalculé par trigger DB)`)
      }

      // ── Masquer le doublon ──────────────────────────────────────────────
      // On le fait APRÈS la suppression des relations : le trigger cmr_masque
      // a déjà tourné (masque=false car plus de relations), on écrase manuellement.
      const { error: maskError } = await supabase
        .from('contacts')
        .update({ masque: true })
        .eq('id', dup.id)

      if (maskError) console.error(`    ❌ erreur masquage:`, maskError.message)
      else { totalDeleted++; console.log(`    → masqué`) }
    }
  }

  if (!dryRun) totalMerged++
}

console.log(`\n${'═'.repeat(60)}`)
console.log(`📋 RÉSUMÉ${dryRun ? ' (DRY RUN)' : ''}`)
console.log(`  Groupes fusionnés : ${dryRun ? duplicateGroups.length : totalMerged}`)
console.log(`  Doublons masqués  : ${dryRun ? duplicateGroups.reduce((s, [, c]) => s + c.length - 1, 0) : totalDeleted}`)
console.log(`  Relations transférées : ${totalRelationsMoved}`)
console.log(`${'═'.repeat(60)}`)
