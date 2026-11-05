import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { demoUsers } from '../data/users'
import type { Role } from '../types'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  if (user) return <Navigate to="/drafts" replace />

  function handleLogin(role: Role) {
    login(role)
    navigate('/drafts')
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <main className="login-page" id="main-content" tabIndex={-1}>
        <section className="login-card" aria-labelledby="login-title">
          <p className="brand-mark">TRUEPRINT</p>
          <h1 id="login-title">Brand, with intent.</h1>
          <p className="tagline">A clear path from first draft to confident publication.</p>
          <div className="role-list" aria-label="Choose a demo role">
            {demoUsers.map((demoUser) => (
              <button
                className="role-button"
                key={demoUser.id}
                onClick={() => handleLogin(demoUser.role)}
                type="button"
              >
                <span className="role-copy">
                  <span className="role-name">{demoUser.role}</span>
                  <span className="role-description">{demoUser.description}</span>
                </span>
                <span className="role-arrow" aria-hidden="true">&#8594;</span>
              </button>
            ))}
          </div>
          <p className="demo-note">Demo mode: pick a role to explore.</p>
        </section>
      </main>
    </>
  )
}