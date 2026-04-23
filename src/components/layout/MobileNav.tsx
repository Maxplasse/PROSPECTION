import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  Upload,
  Menu,
  X,
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

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { membre, signOut } = useAuth()
  const fullAccess = isAdmin(membre?.role)
  const navItems = fullAccess ? allNavItems : allNavItems.filter(item => item.restricted)

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between h-14 px-4 border-b border-border bg-background">
        <div className="flex items-center gap-2.5">
          <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" className="h-6 w-6" />
          <span className="text-base font-bold text-foreground">
            Digi<span className="text-primary">Leads</span>
          </span>
        </div>
        <button onClick={() => setOpen(!open)} className="p-2 text-muted-foreground">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav className="px-3 py-2 border-b border-border bg-background space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => { signOut(); setOpen(false) }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent/60 w-full"
          >
            <LogOut className="h-4 w-4" />
            Se deconnecter
          </button>
        </nav>
      )}
    </div>
  )
}
