import { useEffect, useState } from 'react'
import { getDrafts } from '../lib/api'
import type { DraftsResponse } from '../types'

interface DraftsDataState {
  data: DraftsResponse | null
  loading: boolean
  error: string | null
  retry: () => void
}

export function useDraftsData(): DraftsDataState {
  const [data, setData] = useState<DraftsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function loadDrafts() {
      try {
        const loadedDrafts = await getDrafts(controller.signal)
        if (active) {
          setData(loadedDrafts)
          setError(null)
        }
      } catch (loadError) {
        if (active) {
          setData(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Drafts could not be loaded. Please try again.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDrafts()

    return () => {
      active = false
      controller.abort()
    }
  }, [attempt])

  function retry() {
    setLoading(true)
    setAttempt((currentAttempt) => currentAttempt + 1)
  }

  return { data, loading, error, retry }
}