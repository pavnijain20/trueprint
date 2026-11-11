import { useCallback, useEffect, useRef, useState } from 'react'
import { AIBadge } from './AIBadge'
import { DiffView } from './DiffView'
import {
  applyDraftSuggestion,
  selfCorrectDraft,
} from '../lib/api'
import type { SelfCorrectResponse } from '../lib/api'
import type { User } from '../types'

const statusMessages: Record<SelfCorrectResponse['status'], string> = {
  resolved: 'Fixed, please review',
  needs_human: 'Could not fully fix, you decide',
  clean: 'No fix needed',
  ai_unavailable: 'AI busy, try again',
}

export function SelfCorrectPanel({
  draftId,
  originalContent,
  user,
  onApplied,
  onDismiss,
  onBusyChange,
}: {
  draftId: string
  originalContent: string
  user: User
  onApplied: (content: string) => void
  onDismiss: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [result, setResult] = useState<SelfCorrectResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const requestSelfCorrection = useCallback(
    () => selfCorrectDraft(draftId, 90_000, originalContent),
    [draftId, originalContent],
  )

  useEffect(() => {
    let active = true
    requestSelfCorrection()
      .then((response) => {
        if (active) setResult(response)
      })
      .catch((failure: unknown) => {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'The draft could not be checked. Please try again.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
          onBusyChange(false)
        }
      })

    return () => {
      active = false
    }
  }, [onBusyChange, requestSelfCorrection])

  async function runSelfCorrection() {
    setLoading(true)
    setResult(null)
    setError(null)
    onBusyChange(true)
    try {
      setResult(await requestSelfCorrection())
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'The draft could not be checked. Please try again.',
      )
    } finally {
      setLoading(false)
      onBusyChange(false)
    }
  }

  useEffect(() => {
    if (result) headingRef.current?.focus()
  }, [result])

  async function applySuggestion() {
    if (!result?.suggestedDraft || applying) return
    setApplying(true)
    setError(null)
    onBusyChange(true)
    try {
      const content = await applyDraftSuggestion(draftId, result.suggestedDraft, user)
      onApplied(content)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'The suggestion could not be applied. Please try again.',
      )
    } finally {
      setApplying(false)
      onBusyChange(false)
    }
  }

  const busy = loading || applying

  return (
    <section
      aria-busy={loading}
      aria-labelledby="self-correct-heading"
      className="self-correct-panel"
      role="region"
    >
      <div className="self-correct-heading">
        <h2 id="self-correct-heading" ref={headingRef} tabIndex={-1}>
          Suggested correction
        </h2>
        <AIBadge isAI />
      </div>
      {loading ? (
        <p aria-atomic="true" aria-live="polite" className="self-correct-progress">
          Checking and rewriting your draft. This can take 30-60 seconds.
        </p>
      ) : (
        <>
          {error && <p className="self-correct-error" role="alert">{error}</p>}
          {result && (
            <>
              <p className="self-correct-status" role="status">
                {statusMessages[result.status]}
              </p>
              <p className="self-correct-attempt-count">
                Attempts used: {result.attempts.length} of 2
              </p>
              {result.attempts.length > 0 && (
                <ol className="self-correct-attempts">
                  {result.attempts.map((attempt) => (
                    <li key={attempt.attempt}>
                      <strong>Attempt {attempt.attempt}</strong>
                      {attempt.missingProof && <p>Missing proof: {attempt.missingProof}</p>}
                      <p>Findings remaining: {attempt.remaining}</p>
                    </li>
                  ))}
                </ol>
              )}
              {result.suggestedDraft !== null && (
                <div className="self-correct-diff">
                  <h3>Review the suggested changes</h3>
                  <DiffView
                    currentContent={result.suggestedDraft}
                    previousContent={result.original}
                  />
                </div>
              )}
              <p className="self-correct-disclaimer">
                Nothing is applied until you click Apply.
              </p>
              {result.status === 'ai_unavailable' && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void runSelfCorrection()}
                  type="button"
                >
                  Try again
                </button>
              )}
            </>
          )}
          {error && !result && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void runSelfCorrection()}
              type="button"
            >
              Retry
            </button>
          )}
        </>
      )}
      <div className="self-correct-actions">
        <button
          className="primary-button"
          disabled={busy || result?.suggestedDraft == null}
          onClick={() => void applySuggestion()}
          type="button"
        >
          {applying ? 'Applying...' : 'Apply suggestion'}
        </button>
        <button
          className="logout-button"
          disabled={busy}
          onClick={onDismiss}
          type="button"
        >
          Dismiss
        </button>
      </div>
    </section>
  )
}
