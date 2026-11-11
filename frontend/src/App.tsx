import { useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { EmptyState } from './components/States'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DraftEditorPage } from './pages/DraftEditorPage'
import { DraftsPage } from './pages/DraftsPage'
import { InsightsPage } from './pages/InsightsPage'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { LoginPage } from './pages/LoginPage'
import { ReliabilityPage } from './pages/ReliabilityPage'

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
        <EmptyNotFound />
      </main>
    </>
  )
}

function EmptyNotFound() {
  return (
    <EmptyState
      action={<Link className="text-link" to="/drafts">Go to drafts</Link>}
      description="The page you requested does not exist."
      headingLevel="h1"
      title="Page not found"
    />
  )
}

function RouteTitle() {
  const { pathname } = useLocation()
  const { user } = useAuth()

  useEffect(() => {
    if (pathname === '/login') {
      document.title = 'Log in | TruePrint'
      return
    }

    if (pathname === '/drafts') {
      document.title = 'Drafts | TruePrint'
      return
    }

    if (pathname.startsWith('/drafts/')) {
      document.title = 'Draft review | TruePrint'
      return
    }

    if (pathname === '/knowledge-base') {
      document.title = 'Knowledge Base | TruePrint'
      return
    }

    if (pathname === '/insights') {
      document.title = 'Insights | TruePrint'
      return
    }

    if (pathname === '/reliability') {
      document.title = 'Reliability | TruePrint'
      return
    }

    document.title = 'Page not found | TruePrint'
  }, [pathname, user])

  return null
}

export default function App() {
  return (
    <AuthProvider>
      <RouteTitle />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/drafts" replace />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/drafts/:id" element={<DraftEditorPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBaseRoute />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/reliability" element={<ReliabilityPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}