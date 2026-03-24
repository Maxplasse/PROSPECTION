import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  Upload,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/entreprises', label: 'Entreprises', icon: Building2 },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/import', label: 'Import', icon: Upload },
]

export function Sidebar() {
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
        <div className="px-4 py-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/60">
            Digilityx &middot; Lead Detection
          </p>
        </div>
      </div>
    </aside>
  )
}
