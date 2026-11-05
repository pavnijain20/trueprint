import { useEffect, useState } from 'react'
import { drafts } from '../data/drafts'
import type { Draft } from '../types'

interface DraftsDataState {
  data: readonly Draft[] | null
  loading: boolean
  error: string | null
  retry: () => void
}

export function useDraftsData(): DraftsDataState {
  const [data, setData] = useState<readonly Draft[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const timeoutId = window.setTimeout(() => {
      try {
        if (active) {
          setData(drafts)
          setError(null)
        }
      } catch {
        if (active) {
          setData(null)
          setError('Drafts could not be loaded. Please try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [attempt])

  function retry() {
    setLoading(true)
    setAttempt((currentAttempt) => currentAttempt + 1)
  }

  return { data, loading, error, retry }
}