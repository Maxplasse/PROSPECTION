import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { AuthProvider, useAuth, isAdmin } from './lib/auth'
import { Loader2 } from 'lucide-react'
import Login from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Entreprises = lazy(() => import('./pages/Entreprises'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Membres = lazy(() => import('./pages/Membres'))
const Import = lazy(() => import('./pages/Import'))

function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

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

  const fullAccess = isAdmin(membre?.role)

  return (
    <Suspense fallback={<PageSpinner />}>
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
    </Suspense>
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
