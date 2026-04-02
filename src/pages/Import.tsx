import { useState, useRef } from 'react'
import { Upload, Users, Building2, Loader2, CheckCircle2, AlertCircle, FileText, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ImportResult {
  existingWithChanges: number
  positionChanges: ChangeDetail[]
  companyChanges: ChangeDetail[]
  snapshotsCreated: number
  contactsUpdated: number
  newContacts: number
  newEntreprises: number
  relationsCreated: number
  entreprisesSansTaille: number
}

interface ChangeDetail {
  name: string
  old: string | null
  new: string | null
}

interface EnrichResult {
  updated: number
  skipped: number
  errors: number
}

function parseDuration(s: string | undefined) {
  if (!s) return { years: null, months: null }
  const yMatch = s.match(/(\d+)\s*year/)
  const mMatch = s.match(/(\d+)\s*month/)
  return {
    years: yMatch ? parseInt(yMatch[1]) : 0,
    months: mMatch ? parseInt(mMatch[1]) : 0,
  }
}

function deriveTypology(count: number | null) {
  if (!count) return null
  if (count >= 5000) return 'Grand Groupe'
  if (count >= 250) return 'ETI'
  if (count >= 10) return 'PME'
  return 'TPE'
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n')
  if (lines.length === 0) return []
  const headers = parseCSVLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] || '' })
    rows.push(row)
  }
  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export default function Import() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <p className="text-muted-foreground">
          Importez les résultats de scraping LinkedIn et enrichissez les entreprises.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ContactImportCard />
        <EnrichmentCard />
      </div>
    </div>
  )
}

function ContactImportCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleImport() {
    if (!file) return
    setImporting(true)
    setProgress('Lecture du fichier...')
    setResult(null)
    setError(null)

    try {
      const text = await file.text()
      const rows = parseCSV(text)
      setProgress(`${rows.length} lignes lues`)

      const entreprisesMap = new Map<string, Record<string, unknown>>()
      const contactsMap = new Map<string, Record<string, unknown>>()
      const contactOwners = new Map<string, Set<string>>()

      for (const r of rows) {
        const cid = (r.companyId || '').trim()
        if (cid && !entreprisesMap.has(cid)) {
          entreprisesMap.set(cid, {
            company_name: r.companyName || null,
            company_id_linkedin: cid,
            company_location: r.companyLocation || null,
          })
        }
        const vmid = (r.vmid || '').trim()
        if (!vmid) continue
        if (!contactsMap.has(vmid)) {
          const roleD = parseDuration(r.durationInRole)
          const compD = parseDuration(r.durationInCompany)
          contactsMap.set(vmid, {
            linkedin_url: r.profileUrl || null, first_name: r.firstName || null,
            last_name: r.lastName || null, position: r.title || null,
            location: r.location || null, company_name: r.companyName || null,
            company_id_linkedin: cid || null,
            years_in_position: roleD.years, months_in_position: roleD.months,
            years_in_company: compD.years, months_in_company: compD.months,
            id_url_linkedin: vmid, connection_degree: r.connectionDegree || null,
            is_premium: (r.isPremium || '').toUpperCase() === 'TRUE',
            is_open_link: (r.isOpenLink || '').toUpperCase() === 'TRUE',
            shared_connections_count: parseInt(r.sharedConnectionsCount || '0') || 0,
            profile_image_url: r.profileImageUrl || null,
            default_profile_url: r.defaultProfileUrl || null,
          })
          contactOwners.set(vmid, new Set())
        }
        const owner = (r.owner || '').trim()
        if (owner) contactOwners.get(vmid)!.add(owner)
      }

      setProgress(`${contactsMap.size} contacts, ${entreprisesMap.size} entreprises`)

      // Fetch existing contacts
      setProgress('Comparaison avec la base...')
      const vmids = [...contactsMap.keys()]
      const existingContacts = new Map<string, Record<string, unknown>>()
      for (let i = 0; i < vmids.length; i += 500) {
        const batch = vmids.slice(i, i + 500)
        const { data } = await supabase
          .from('contacts')
          .select('id, id_url_linkedin, position, company_name, company_id_linkedin, location, entreprise_id')
          .in('id_url_linkedin', batch)
        if (data) for (const c of data) existingContacts.set(c.id_url_linkedin as string, c)
      }

      // Detect changes
      setProgress('Détection des changements...')
      const positionChanges: ChangeDetail[] = []
      const companyChanges: ChangeDetail[] = []
      let snapshotsCreated = 0
      let contactsUpdated = 0

      for (const [vmid, csvData] of contactsMap) {
        const dbRow = existingContacts.get(vmid)
        if (!dbRow) continue
        const changes: { field: string; old_val: string | null; new_val: string | null }[] = []

        if (csvData.position && csvData.position !== dbRow.position) {
          changes.push({ field: 'position', old_val: dbRow.position as string, new_val: csvData.position as string })
          positionChanges.push({ name: `${csvData.first_name} ${csvData.last_name}`, old: dbRow.position as string, new: csvData.position as string })
        }
        if (csvData.company_name && csvData.company_name !== dbRow.company_name) {
          changes.push({ field: 'company_name', old_val: dbRow.company_name as string, new_val: csvData.company_name as string })
          companyChanges.push({ name: `${csvData.first_name} ${csvData.last_name}`, old: dbRow.company_name as string, new: csvData.company_name as string })
        }
        if (csvData.company_id_linkedin && csvData.company_id_linkedin !== dbRow.company_id_linkedin)
          changes.push({ field: 'company_id_linkedin', old_val: dbRow.company_id_linkedin as string, new_val: csvData.company_id_linkedin as string })
        if (csvData.location && csvData.location !== dbRow.location)
          changes.push({ field: 'location', old_val: dbRow.location as string, new_val: csvData.location as string })

        if (changes.length > 0) {
          await supabase.from('scraping_snapshots').insert({
            contact_id: dbRow.id, scraped_at: new Date().toISOString(),
            position: csvData.position, company_name: csvData.company_name,
            company_id_linkedin: csvData.company_id_linkedin, location: csvData.location,
            connection_degree: csvData.connection_degree, is_premium: csvData.is_premium,
            shared_connections_count: csvData.shared_connections_count,
            profile_image_url: csvData.profile_image_url,
          })
          snapshotsCreated++

          const updateData: Record<string, unknown> = { last_scraped_at: new Date().toISOString() }
          for (const c of changes) updateData[c.field] = c.new_val
          if (updateData.company_id_linkedin) {
            const { data: ent } = await supabase.from('entreprises').select('id').eq('company_id_linkedin', updateData.company_id_linkedin as string).single()
            if (ent) updateData.entreprise_id = ent.id
          }
          await supabase.from('contacts').update(updateData).eq('id', dbRow.id)
          contactsUpdated++
        }
      }

      // Insert new entreprises
      setProgress('Nouvelles entreprises...')
      const entItems = [...entreprisesMap.values()]
      let entInserted = 0
      for (let i = 0; i < entItems.length; i += 50) {
        const batch = entItems.slice(i, i + 50)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: err } = await supabase.from('entreprises').upsert(batch as any[], { onConflict: 'company_id_linkedin', ignoreDuplicates: true })
        if (!err) entInserted += batch.length
      }

      // Insert new contacts
      setProgress('Nouveaux contacts...')
      const newContactEntries = [...contactsMap.entries()].filter(([vmid]) => !existingContacts.has(vmid))
      let conInserted = 0
      for (let i = 0; i < newContactEntries.length; i += 50) {
        const batch = newContactEntries.slice(i, i + 50).map(([, data]) => ({ ...data, last_scraped_at: new Date().toISOString() }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: err } = await supabase.from('contacts').upsert(batch as any[], { onConflict: 'linkedin_url', ignoreDuplicates: true })
        if (!err) conInserted += batch.length
        if ((i + 50) % 500 === 0) setProgress(`Contacts: ${Math.min(i + 50, newContactEntries.length)}/${newContactEntries.length}`)
      }

      // Relations
      setProgress('Relations...')
      const { data: membres } = await supabase.from('membres_digilityx').select('id, full_name')
      const membreMap = Object.fromEntries((membres || []).map(m => [m.full_name, m.id]))

      const allContactIds = new Map<string, string>()
      for (let i = 0; i < vmids.length; i += 500) {
        const batch = vmids.slice(i, i + 500)
        const { data } = await supabase.from('contacts').select('id, id_url_linkedin').in('id_url_linkedin', batch)
        if (data) for (const c of data) allContactIds.set(c.id_url_linkedin, c.id)
      }

      const relations: { contact_id: string; membre_id: string; niveau_de_relation: string }[] = []
      for (const [vmid, owners] of contactOwners) {
        const contactId = allContactIds.get(vmid)
        if (!contactId) continue
        for (const ownerName of owners) {
          const membreId = membreMap[ownerName]
          if (!membreId) continue
          relations.push({ contact_id: contactId, membre_id: membreId, niveau_de_relation: 'Connaissance' })
        }
      }

      let relInserted = 0
      for (let i = 0; i < relations.length; i += 50) {
        const batch = relations.slice(i, i + 50)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: err } = await supabase.from('contacts_membres_relations').upsert(batch as any[], { onConflict: 'contact_id,membre_id', ignoreDuplicates: true })
        if (!err) relInserted += batch.length
      }

      const { count: sansTaille } = await supabase.from('entreprises').select('id', { count: 'exact', head: true }).is('company_employee_count', null)

      setResult({
        existingWithChanges: positionChanges.length + companyChanges.length,
        positionChanges: positionChanges.slice(0, 10),
        companyChanges: companyChanges.slice(0, 10),
        snapshotsCreated, contactsUpdated,
        newContacts: conInserted, newEntreprises: entInserted,
        relationsCreated: relInserted, entreprisesSansTaille: sansTaille ?? 0,
      })
      setProgress('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Import Contacts LinkedIn</h3>
          <p className="text-sm text-muted-foreground">CSV Phantombuster (scraping mensuel)</p>
        </div>
      </div>

      <div className="space-y-3">
        <input ref={fileRef} type="file" accept=".csv" onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); setError(null) }} className="hidden" />
        <button onClick={() => fileRef.current?.click()} className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 p-6 text-center transition-colors">
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{file.name}</span>
              <Badge variant="outline">{(file.size / 1024 / 1024).toFixed(1)} MB</Badge>
            </div>
          ) : (
            <div>
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Cliquer pour sélectionner un fichier CSV</p>
            </div>
          )}
        </button>
        <Button onClick={handleImport} disabled={!file || importing} className="w-full">
          {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {progress}</> : <><Upload className="h-4 w-4 mr-2" /> Lancer l'import</>}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      {result && <ImportResultPanel result={result} />}
    </div>
  )
}

function ImportResultPanel({ result }: { result: ImportResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h4 className="font-semibold text-emerald-800 dark:text-emerald-400">Import terminé</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-muted-foreground">Nouveaux contacts</p><p className="text-lg font-bold">{result.newContacts}</p></div>
          <div><p className="text-muted-foreground">Nouvelles entreprises</p><p className="text-lg font-bold">{result.newEntreprises}</p></div>
          <div><p className="text-muted-foreground">Relations créées</p><p className="text-lg font-bold">{result.relationsCreated}</p></div>
          <div><p className="text-muted-foreground">Changements détectés</p><p className="text-lg font-bold">{result.existingWithChanges}</p></div>
        </div>
      </div>

      {result.positionChanges.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Changements de poste</h5>
          <div className="space-y-1">
            {result.positionChanges.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5">
                <span className="font-medium shrink-0">{c.name}</span>
                <span className="text-muted-foreground truncate">{c.old}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-amber-500" />
                <span className="font-medium text-amber-700 dark:text-amber-400 truncate">{c.new}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.companyChanges.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Changements d'entreprise</h5>
          <div className="space-y-1">
            {result.companyChanges.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5">
                <span className="font-medium shrink-0">{c.name}</span>
                <span className="text-muted-foreground truncate">{c.old}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-blue-500" />
                <span className="font-medium text-blue-700 dark:text-blue-400 truncate">{c.new}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.entreprisesSansTaille > 0 && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="text-muted-foreground">
            <Building2 className="inline h-4 w-4 mr-1" />
            <strong>{result.entreprisesSansTaille}</strong> entreprises sans taille — enrichissez-les via le panneau ci-contre.
          </p>
        </div>
      )}
    </div>
  )
}

function EnrichmentCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<EnrichResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleEnrich() {
    if (!file) return
    setImporting(true)
    setProgress('Lecture du fichier...')
    setResult(null)
    setError(null)

    try {
      const text = await file.text()
      const rows = parseCSV(text)
      setProgress(`${rows.length} lignes lues`)

      let updated = 0, skipped = 0, errors = 0

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const linkedinId = r.mainCompanyID || r.linkedinID || ''
        if (!linkedinId) { skipped++; continue }
        const empCount = parseInt(r.employeesOnLinkedIn || '0') || null
        if (!empCount) { skipped++; continue }

        const empRange = (r["tailleDel'entreprise"] || '').replace(/\s*employés?\s*/i, '').trim() || null

        const updateData: Record<string, unknown> = {
          company_employee_count: empCount,
          company_employee_range: empRange,
          company_typology: deriveTypology(empCount),
        }
        const website = r.website || r.siteWeb
        if (website) {
          updateData.company_website = website
          try { updateData.company_domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace('www.', '') } catch { /* */ }
        }
        if (r.description) updateData.company_description = r.description.slice(0, 500)
        if (r.industry || r.secteur) updateData.linkedin_industry = r.industry || r.secteur
        if (r.companyAddress || r.location) updateData.company_location = r.companyAddress || r.location
        if (r['spécialisations']) updateData.company_specialties = r['spécialisations'].slice(0, 500)

        const { error: err } = await supabase.from('entreprises').update(updateData).eq('company_id_linkedin', linkedinId)
        if (err) errors++; else updated++

        if ((i + 1) % 500 === 0) setProgress(`${i + 1}/${rows.length} (${updated} enrichies)`)
      }

      setResult({ updated, skipped, errors })
      setProgress('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-violet-500/10 p-2">
          <Building2 className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Enrichissement Entreprises</h3>
          <p className="text-sm text-muted-foreground">CSV Phantombuster Company Scraper</p>
        </div>
      </div>

      <div className="space-y-3">
        <input ref={fileRef} type="file" accept=".csv" onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); setError(null) }} className="hidden" />
        <button onClick={() => fileRef.current?.click()} className="w-full rounded-lg border-2 border-dashed border-border hover:border-violet-500/50 p-6 text-center transition-colors">
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="h-5 w-5 text-violet-500" />
              <span className="text-sm font-medium">{file.name}</span>
              <Badge variant="outline">{(file.size / 1024 / 1024).toFixed(1)} MB</Badge>
            </div>
          ) : (
            <div>
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Cliquer pour sélectionner un fichier CSV</p>
            </div>
          )}
        </button>
        <Button onClick={handleEnrich} disabled={!file || importing} className="w-full" variant="outline">
          {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {progress}</> : <><Building2 className="h-4 w-4 mr-2" /> Lancer l'enrichissement</>}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h4 className="font-semibold text-emerald-800 dark:text-emerald-400">Enrichissement terminé</h4>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-muted-foreground">Enrichies</p><p className="text-lg font-bold">{result.updated}</p></div>
            <div><p className="text-muted-foreground">Sans données</p><p className="text-lg font-bold">{result.skipped}</p></div>
            <div><p className="text-muted-foreground">Erreurs</p><p className="text-lg font-bold">{result.errors}</p></div>
          </div>
        </div>
      )}
    </div>
  )
}
