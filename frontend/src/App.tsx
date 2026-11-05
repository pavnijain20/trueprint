import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'
import type { Role } from './types'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

function ProtectedRoute() {
  const { user } = useAuth()
  return user ? <Layout /> : <Navigate to="/login" replace />
}

function RoleRoute({
  allowedRoles,
  title,
  description,
}: {
  allowedRoles: readonly Role[]
  title: string
  description: string
}) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (!allowedRoles.includes(user.role)) return <Navigate to="/drafts" replace />

  return <PlaceholderPage title={title} description={description} />
}

function NotFoundPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <main className="not-found" id="main-content" tabIndex={-1}>
        <p className="eyebrow">TRUEPRINT</p>
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <Link className="text-link" to="/drafts">Go to drafts</Link>
      </main>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/drafts" replace />} />
          <Route path="/drafts" element={<PlaceholderPage title="Drafts" description="Your team's drafts will appear here." />} />
          <Route path="/drafts/:id" element={<PlaceholderPage title="Draft editor" description="Review and refine a draft before publication." />} />
          <Route
            path="/knowledge-base"
            element={
              <RoleRoute
                allowedRoles={['reviewer', 'approver', 'admin']}
                title="Knowledge Base"
                description="Brand guidance and approved reference material will appear here."
              />
            }
          />
          <Route
            path="/insights"
            element={
              <RoleRoute
                allowedRoles={['approver', 'admin']}
                title="Insights"
                description="Publication and governance insights will appear here."
              />
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}