import { Bell } from 'lucide-react'

export default function Notifications() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground">
          Centre de notifications Slack et alertes de scoring.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
        <Bell className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium">Aucune notification</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Les notifications apparaîtront lorsque le scoring sera actif.
        </p>
      </div>
    </div>
  )
}
