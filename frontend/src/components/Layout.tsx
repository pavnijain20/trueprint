import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'

const navigationItems: {
  label: string
  to: string
  roles: readonly Role[]
}[] = [
  { label: 'Drafts', to: '/drafts', roles: ['author', 'reviewer', 'approver', 'admin'] },
  { label: 'Knowledge Base', to: '/knowledge-base', roles: ['reviewer', 'approver', 'admin'] },
  { label: 'Insights', to: '/insights', roles: ['approver', 'admin'] },
]

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <p className="brand-mark">TRUEPRINT</p>
          </div>
          <p className="sidebar-label">Workspace</p>
          <nav aria-label="Main navigation">
            {navigationItems
              .filter((item) => item.roles.includes(user.role))
              .map((item) => (
                <NavLink
                  className="nav-link"
                  key={item.to}
                  to={item.to}
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
        </aside>
        <div className="shell-content">
          <header className="topbar">
            <div className="user-summary" aria-label={`Signed in as ${user.name}, ${user.role}`}>
              <span className="user-name">{user.name}</span>
              <span className="role-badge">{user.role}</span>
            </div>
            <button className="logout-button" onClick={handleLogout} type="button">
              Log out
            </button>
          </header>
          <main className="page-content" id="main-content" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>
    </>
  )
}