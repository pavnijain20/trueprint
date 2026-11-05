import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { demoUsers } from '../data/users'
import type { Role, User } from '../types'

interface AuthContextValue {
  user: User | null
  login: (role: Role) => void
  logout: () => void
}

const storageKey = 'trueprint.demo-user'
const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredUser(): User | null {
  try {
    const storedValue = localStorage.getItem(storageKey)
    if (!storedValue) return null

    const parsedValue: unknown = JSON.parse(storedValue)
    if (typeof parsedValue !== 'object' || parsedValue === null) return null
    if (!('id' in parsedValue) || typeof parsedValue.id !== 'string') return null
    if (!('role' in parsedValue) || typeof parsedValue.role !== 'string') return null

    return demoUsers.find(
      (demoUser) => demoUser.id === parsedValue.id && demoUser.role === parsedValue.role,
    ) ?? null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser)

  function login(role: Role) {
    const selectedUser = demoUsers.find((demoUser) => demoUser.role === role)
    if (!selectedUser) return

    setUser(selectedUser)
    try {
      localStorage.setItem(storageKey, JSON.stringify(selectedUser))
    } catch {
      // The session remains available in memory when browser storage is disabled.
    }
  }

  function logout() {
    setUser(null)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Clearing in-memory state still logs the user out for this page session.
    }
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

// The hook intentionally shares this module with its provider context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}