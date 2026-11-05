import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DraftEditorPage } from './pages/DraftEditorPage'
import { DraftsPage } from './pages/DraftsPage'
import { InsightsPage } from './pages/InsightsPage'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { LoginPage } from './pages/LoginPage'

function ProtectedRoute() {
  const { user } = useAuth()
  return user ? <Layout /> : <Navigate to="/login" replace />
}

function KnowledgeBaseRoute() {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'author') return <Navigate to="/drafts" replace />

  return <KnowledgeBasePage />
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
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/drafts/:id" element={<DraftEditorPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBaseRoute />} />
          <Route path="/insights" element={<InsightsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}