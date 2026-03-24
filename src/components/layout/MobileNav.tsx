import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  Upload,
  Menu,
  X,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/entreprises', label: 'Entreprises', icon: Building2 },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/import', label: 'Import', icon: Upload },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)

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
        </nav>
      )}
    </div>
  )
}
