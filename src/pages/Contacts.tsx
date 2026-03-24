import { useState } from 'react'
import { Users, Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSupabaseQuery } from '@/lib/hooks/use-supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ContactDrawer } from '@/components/contacts/ContactDrawer'

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  company_name: string | null
  location: string | null
  linkedin_url: string | null
  email: string | null
  persona: string | null
  hierarchie: string | null
  priorite: string | null
  statut_contact: string | null
  niveau_de_relation: string | null
  scoring: number
  nb_personnes_digi_relation: number
  contact_digi: boolean
  entreprise_id: string | null
}

const PAGE_SIZE = 50

const HIERARCHIE_COLORS: Record<string, string> = {
  'COMEX': 'default',
  'Directeur': 'secondary',
  'Responsable': 'outline',
  'Opérationnel': 'ghost',
}

function ScoreBar({ score }: { score: number }) {
  if (score === 0) return <span className="text-xs text-muted-foreground">—</span>

  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium">{score}</span>
    </div>
  )
}

function RelationCount({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs text-muted-foreground">—</span>
  const color = count >= 3 ? 'default' : count >= 2 ? 'secondary' : 'outline'
  return <Badge variant={color as 'default'}>{count}</Badge>
}

export default function Contacts() {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [hierarchieFilter, setHierarchieFilter] = useState<string>('all')
  const [personaFilter, setPersonaFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('relations')
  const [selected, setSelected] = useState<ContactRow | null>(null)

  const orderColumn = sortBy === 'relations' ? 'nb_personnes_digi_relation'
    : sortBy === 'scoring' ? 'scoring'
    : 'created_at'

  const { data: contacts, loading, refetch } = useSupabaseQuery<ContactRow[]>(
    () => {
      let query = supabase
        .from('contacts')
        .select('id, first_name, last_name, position, company_name, location, linkedin_url, email, persona, hierarchie, priorite, statut_contact, niveau_de_relation, scoring, nb_personnes_digi_relation, contact_digi, entreprise_id')
        .order(orderColumn, { ascending: false })

      if (hierarchieFilter !== 'all') query = query.eq('hierarchie', hierarchieFilter)
      if (personaFilter !== 'all') query = query.eq('persona', personaFilter)
      if (search.trim()) {
        query = query.or(`first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%,company_name.ilike.%${search.trim()}%`)
      }

      return query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    },
    [page, hierarchieFilter, personaFilter, search, sortBy]
  )

  const { data: countResult } = useSupabaseQuery<{ count: number }[]>(
    async () => {
      let query = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })

      if (hierarchieFilter !== 'all') query = query.eq('hierarchie', hierarchieFilter)
      if (personaFilter !== 'all') query = query.eq('persona', personaFilter)
      if (search.trim()) {
        query = query.or(`first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%,company_name.ilike.%${search.trim()}%`)
      }

      const res = await query
      return { data: [{ count: res.count ?? 0 }], error: res.error }
    },
    [hierarchieFilter, personaFilter, search]
  )

  const totalCount = countResult?.[0]?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">
          {totalCount.toLocaleString('fr-FR')} contacts qualifiés avec scoring et priorité.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher nom, entreprise..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <Select value={hierarchieFilter} onValueChange={(v) => { setHierarchieFilter(v as string); setPage(0) }}>
          <SelectTrigger>
            <SelectValue>{hierarchieFilter === 'all' ? 'Toute hiérarchie' : hierarchieFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute hiérarchie</SelectItem>
            <SelectItem value="COMEX">COMEX</SelectItem>
            <SelectItem value="Directeur">Directeur</SelectItem>
            <SelectItem value="Responsable">Responsable</SelectItem>
            <SelectItem value="Opérationnel">Opérationnel</SelectItem>
          </SelectContent>
        </Select>

        <Select value={personaFilter} onValueChange={(v) => { setPersonaFilter(v as string); setPage(0) }}>
          <SelectTrigger>
            <SelectValue>{personaFilter === 'all' ? 'Toute persona' : personaFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute persona</SelectItem>
            <SelectItem value="Dirigeant">Dirigeant</SelectItem>
            <SelectItem value="Marketing">Marketing</SelectItem>
            <SelectItem value="Produit">Produit</SelectItem>
            <SelectItem value="Design">Design</SelectItem>
            <SelectItem value="Commercial">Commercial</SelectItem>
            <SelectItem value="Hors expertise Digi">Hors expertise</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => { setSortBy(v as string); setPage(0) }}>
          <SelectTrigger>
            <SelectValue>
              {sortBy === 'relations' ? 'Relations Digi' : sortBy === 'scoring' ? 'Scoring' : 'Plus récent'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relations">Relations Digi</SelectItem>
            <SelectItem value="scoring">Scoring</SelectItem>
            <SelectItem value="recent">Plus récent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !contacts || contacts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">Aucun contact trouvé</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Essayez de modifier vos filtres.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Qualification</TableHead>
                  <TableHead className="text-center">Digi</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                    <TableCell>
                      <p className="font-medium text-sm">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {c.position ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm truncate max-w-[160px]">{c.company_name ?? '—'}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.hierarchie ? (
                          <Badge variant={(HIERARCHIE_COLORS[c.hierarchie] ?? 'outline') as 'default'}>
                            {c.hierarchie}
                          </Badge>
                        ) : null}
                        {c.persona && c.persona !== 'Hors expertise Digi' ? (
                          <Badge variant="outline">{c.persona}</Badge>
                        ) : null}
                        {c.statut_contact ? (
                          <Badge variant="secondary">{c.statut_contact}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <RelationCount count={c.nb_personnes_digi_relation} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ScoreBar score={c.scoring} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} / {totalPages || 1} · {totalCount.toLocaleString('fr-FR')} résultats
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <ContactDrawer
        contact={selected}
        onClose={() => setSelected(null)}
        onSaved={() => { setSelected(null); refetch() }}
      />
    </div>
  )
}
