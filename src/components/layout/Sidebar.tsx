import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  Upload,
  LogOut,
} from 'lucide-react'
import { DigiIcon } from '@/components/icons/DigiIcon'
import { useAuth, isAdmin } from '@/lib/auth'

const allNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, restricted: false },
  { to: '/entreprises', label: 'Entreprises', icon: Building2, restricted: true },
  { to: '/contacts', label: 'Contacts', icon: Users, restricted: true },
  { to: '/membres', label: 'Membres Digi', icon: DigiIcon, restricted: false },
  { to: '/import', label: 'Import', icon: Upload, restricted: false },
]

export function Sidebar() {
  const { membre, signOut } = useAuth()
  const fullAccess = isAdmin(membre?.role)

  const navItems = fullAccess
    ? allNavItems
    : allNavItems.filter(item => item.restricted)

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-sidebar-border bg-sidebar">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-3 h-16 px-5 border-b border-sidebar-border">
          <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            Digi<span className="text-primary">Leads</span>
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-sidebar-border space-y-3">
          {membre && (
            <div className="px-3">
              <p className="text-sm font-medium truncate">{membre.full_name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{membre.role}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Se deconnecter
          </button>
        </div>
      </div>
    </aside>
  )
}
