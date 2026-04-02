import { Link } from 'react-router-dom'
import { Building2, Users, Target, Eye, Loader2 } from 'lucide-react'
import { useDashboardStats } from '@/lib/hooks/use-supabase'
import { useSupabaseQuery } from '@/lib/hooks/use-supabase'
import { supabase } from '@/lib/supabase'
interface RecentContact {
  id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  company_name: string | null
  nb_personnes_digi_relation: number
  scoring: number
  created_at: string
}

function StatCard({ label, value, icon: Icon, description, accent, href }: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  description: string
  accent?: string
  href?: string
}) {
  const iconColor = accent ?? 'text-primary'
  const content = (
    <div className={`rounded-lg border border-border bg-card p-6 shadow-sm${href ? ' hover:border-primary/40 transition-colors' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`rounded-md p-1.5 ${accent ? accent + '/10 ' + iconColor : 'bg-primary/10 text-primary'}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
  if (href) return <Link to={href}>{content}</Link>
  return content
}

function TierBar({ label, count, total, color, href }: {
  label: string
  count: number
  total: number
  color: string
  href?: string
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  const content = (
    <div className={`flex items-center gap-3${href ? ' hover:bg-muted/50 -mx-2 px-2 py-1 rounded-md transition-colors cursor-pointer' : ''}`}>
      <span className="w-16 text-sm font-medium">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-sm text-muted-foreground">{count.toLocaleString('fr-FR')}</span>
    </div>
  )
  if (href) return <Link to={href}>{content}</Link>
  return content
}

export default function Dashboard() {
  const { data: stats, loading } = useDashboardStats()

  const { data: secteurStats } = useSupabaseQuery<{ secteur_digi: string; count: number }[]>(
    async () => {
      const { data, error } = await supabase.rpc('get_secteur_stats')
      if (error) {
        // Fallback: fetch all secteur_digi with pagination to avoid 1000 limit
        const all: { secteur_digi: string | null }[] = []
        let offset = 0
        const PAGE = 1000
        while (true) {
          const { data: raw, error: rawErr } = await supabase
            .from('entreprises')
            .select('secteur_digi')
            .range(offset, offset + PAGE - 1)
          if (rawErr) return { data: null, error: rawErr }
          if (!raw || raw.length === 0) break
          all.push(...raw)
          if (raw.length < PAGE) break
          offset += PAGE
        }
        const counts: Record<string, number> = {}
        all.forEach(e => {
          const s = e.secteur_digi || 'Non classé'
          counts[s] = (counts[s] || 0) + 1
        })
        const result = Object.entries(counts)
          .map(([secteur_digi, count]) => ({ secteur_digi, count }))
          .sort((a, b) => b.count - a.count)
        return { data: result, error: null }
      }
      return { data, error }
    }
  )

  const { data: recentContacts } = useSupabaseQuery<RecentContact[]>(
    () => supabase
      .from('contacts')
      .select('id, first_name, last_name, position, company_name, nb_personnes_digi_relation, scoring, created_at')
      .order('nb_personnes_digi_relation', { ascending: false })
      .limit(10)
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const s = stats ?? {
    total_entreprises: 0, total_contacts: 0, total_notifications: 0,
    deals_en_cours: 0, contacts_a_contacter: 0, contacts_contactes: 0,
    tier1: 0, tier2: 0, tier3: 0,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Vue d'ensemble de votre pipeline de leads.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Entreprises"
          value={s.total_entreprises.toLocaleString('fr-FR')}
          icon={Building2}
          description="Total en base"
          accent="text-violet-600 bg-violet-600"
          href="/entreprises"
        />
        <StatCard
          label="Contacts"
          value={s.total_contacts.toLocaleString('fr-FR')}
          icon={Users}
          description="Contacts importés"
          accent="text-sky-500 bg-sky-500"
          href="/contacts"
        />
        <StatCard
          label="À contacter"
          value={s.contacts_a_contacter.toLocaleString('fr-FR')}
          icon={Target}
          description="Contacts prioritaires"
          accent="text-emerald-500 bg-emerald-500"
          href="/contacts?statut=À contacter"
        />
        <StatCard
          label="Contacté"
          value={s.contacts_contactes.toLocaleString('fr-FR')}
          icon={Eye}
          description="Activement démarchés"
          accent="text-amber-500 bg-amber-500"
          href="/contacts?statut=Contacté"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Répartition par Tier</h2>
          <div className="space-y-3">
            <TierBar label="Tier 1" count={s.tier1} total={s.total_entreprises} color="bg-emerald-500" href="/entreprises?tier=Tier 1" />
            <TierBar label="Tier 2" count={s.tier2} total={s.total_entreprises} color="bg-amber-500" href="/entreprises?tier=Tier 2" />
            <TierBar label="Tier 3" count={s.tier3} total={s.total_entreprises} color="bg-slate-400" href="/entreprises?tier=Tier 3" />
            <TierBar
              label="Hors-Tier"
              count={s.total_entreprises - s.tier1 - s.tier2 - s.tier3}
              total={s.total_entreprises}
              color="bg-muted-foreground/30"
              href="/entreprises?tier=Hors-Tier"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Pipeline</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link to="/entreprises?statut=Deal en cours" className="rounded-md bg-muted/50 p-4 text-center hover:bg-muted transition-colors">
              <p className="text-2xl font-bold">{s.deals_en_cours}</p>
              <p className="text-xs text-muted-foreground mt-1">Deals en cours</p>
            </Link>
            <Link to="/notifications" className="rounded-md bg-muted/50 p-4 text-center hover:bg-muted transition-colors">
              <p className="text-2xl font-bold">{s.total_notifications}</p>
              <p className="text-xs text-muted-foreground mt-1">Notifications</p>
            </Link>
          </div>
        </div>
      </div>

      {secteurStats && secteurStats.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Répartition par Secteur</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {secteurStats.slice(0, 14).map(s => (
              <Link
                key={s.secteur_digi}
                to={`/entreprises?secteur=${encodeURIComponent(s.secteur_digi)}`}
                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 hover:bg-muted transition-colors"
              >
                <span className="text-sm truncate">{s.secteur_digi}</span>
                <span className="text-sm font-medium text-muted-foreground ml-2">{s.count.toLocaleString('fr-FR')}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Contacts les plus connectés</h2>
        {recentContacts && recentContacts.length > 0 ? (
          <div className="divide-y divide-border">
            {recentContacts.map(c => (
              <Link
                key={c.id}
                to={`/contacts?contact=${c.id}`}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0 -mx-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.first_name} {c.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.position} {c.company_name ? `· ${c.company_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-xs text-muted-foreground">
                    {c.nb_personnes_digi_relation} relation{c.nb_personnes_digi_relation > 1 ? 's' : ''} Digi
                  </span>
                  {c.scoring > 0 && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {c.scoring}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune donnée disponible.</p>
        )}
      </div>
    </div>
  )
}
