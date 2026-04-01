import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { AuthProvider, useAuth, isAdminOrAM } from './lib/auth'
import { Loader2 } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Entreprises from './pages/Entreprises'
import Contacts from './pages/Contacts'
import Notifications from './pages/Notifications'
import Membres from './pages/Membres'
import Import from './pages/Import'
import Login from './pages/Login'

const basename = import.meta.env.BASE_URL

function AppRoutes() {
  const { user, membre, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return <Login />

  const fullAccess = isAdminOrAM(membre?.role)

  return (
    <Routes>
      <Route element={<Layout />}>
        {fullAccess ? (
          <>
            <Route index element={<Dashboard />} />
            <Route path="entreprises" element={<Entreprises />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="membres" element={<Membres />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="import" element={<Import />} />
          </>
        ) : (
          <>
            <Route index element={<Navigate to="/contacts" replace />} />
            <Route path="entreprises" element={<Entreprises />} />
            <Route path="contacts" element={<Contacts />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
