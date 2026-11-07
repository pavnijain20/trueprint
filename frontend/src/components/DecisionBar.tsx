import { useEffect, useRef, useState } from 'react'
import type { Decision, DraftStatus, User } from '../types'

type DecisionType = Decision['type']

export function DecisionBar({
  status,
  statusConfirmed,
  user,
  hasOpenHighFinding,
  onConfirm,
  onSubmit,
  submitting = false,
}: {
  status: DraftStatus
  statusConfirmed: boolean
  user: User
  hasOpenHighFinding: boolean
  onConfirm: (type: Decision['type'], note: string) => Promise<void>
  onSubmit: () => Promise<void>
  submitting?: boolean
}) {
  const [action, setAction] = useState<DecisionType | null>(null)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const canDecide = user.role === 'approver' || user.role === 'admin'
  const canRequestChanges = user.role === 'reviewer' || canDecide
  const canSubmit = user.role === 'author'
  const canRecordDecision = statusConfirmed && status === 'in_review'

  useEffect(() => {
    if (!action) return

    noteRef.current?.focus()
    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog()
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled])',
      )]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first)?.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleDialogKeyDown)
    return () => document.removeEventListener('keydown', handleDialogKeyDown)
  }, [action])

  function closeDialog() {
    setAction(null)
    setNote('')
    setError(null)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function openDialog(type: DecisionType, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setAction(type)
    setNote('')
    setError(null)
  }

  async function confirmDecision() {
    if (!action || pending || !canRecordDecision
      || (action === 'approved' && !canDecide)
      || (action === 'changes_requested' && !canRequestChanges)
      || (action === 'changes_requested' && !note.trim())) return
    setPending(true)
    setError(null)
    try {
      await onConfirm(action, note.trim())
      closeDialog()
    } catch (decisionFailure) {
      setError(
        decisionFailure instanceof Error
          ? decisionFailure.message
          : 'The decision could not be recorded.',
      )
    } finally {
      setPending(false)
    }
  }

  async function submitDraft() {
    if (pending || submitting) return
    setPending(true)
    setError(null)
    try {
      await onSubmit()
    } catch (submitFailure) {
      setError(
        submitFailure instanceof Error
          ? submitFailure.message
          : 'The draft could not be submitted.',
      )
    } finally {
      setPending(false)
    }
  }

  if (!canRequestChanges) {
    const statusMessage = `Current status: ${status.replace('_', ' ')}`
    return (
      <aside className="decision-bar" aria-label="Review status">
        <div>
          <p className="decision-status">{statusConfirmed ? statusMessage : 'Workflow status unconfirmed'}</p>
          <p className="decision-disclaimer">AI findings are suggestions. A human makes the final decision.</p>
          {canSubmit && status !== 'in_review' && status !== 'approved' && (
            <button
              className="primary-button"
              disabled={!statusConfirmed || pending || submitting}
              onClick={() => void submitDraft()}
              type="button"
            >
              {pending || submitting ? 'Submitting...' : 'Submit for review'}
            </button>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
    )
  }

  return (
    <>
      <aside className="decision-bar" aria-label="Draft decision">
        <div className="decision-copy">
          <p className="decision-status">
            {statusConfirmed ? `Current status: ${status.replace('_', ' ')}` : 'Workflow status unconfirmed'}
          </p>
          <p className="decision-disclaimer">AI findings are suggestions. A human makes the final decision.</p>
        </div>
        <div className="decision-actions">
          {canDecide && (
            <div className="approve-action">
              <button
                aria-describedby={hasOpenHighFinding ? 'approval-disabled-reason' : undefined}
                className="primary-button"
                disabled={!canRecordDecision || hasOpenHighFinding || pending || submitting}
                onClick={(event) => openDialog('approved', event.currentTarget)}
                type="button"
              >
                Approve
              </button>
              {hasOpenHighFinding && (
                <p className="decision-reason" id="approval-disabled-reason">
                  Resolve all open high-severity findings before approving.
                </p>
              )}
            </div>
          )}
          <button
            className="secondary-button"
            disabled={!canRecordDecision || pending || submitting}
            onClick={(event) => openDialog('changes_requested', event.currentTarget)}
            type="button"
          >
            Request changes
          </button>
        </div>
      </aside>

      {action && (
        <div className="dialog-backdrop">
          <div
            aria-labelledby="decision-dialog-title"
            aria-modal="true"
            className="decision-dialog"
            ref={dialogRef}
            role="dialog"
          >
            <h2 id="decision-dialog-title">
              {action === 'approved' ? 'Approve this draft?' : 'Request changes?'}
            </h2>
            <p>
              {action === 'approved'
                ? 'This will mark the draft as approved.'
                : 'Add a note explaining what needs to change.'}
            </p>
            <label htmlFor="decision-note">
              Note {action === 'changes_requested' ? '(required)' : '(optional)'}
            </label>
            <textarea
              aria-required={action === 'changes_requested'}
              id="decision-note"
              disabled={pending}
              onChange={(event) => setNote(event.target.value)}
              ref={noteRef}
              rows={4}
              value={note}
            />
            <div className="dialog-actions">
              <button className="logout-button" disabled={pending} onClick={closeDialog} type="button">Cancel</button>
              <button
                className="primary-button"
                disabled={!canRecordDecision || submitting || pending
                  || (action === 'approved' && !canDecide)
                  || (action === 'changes_requested' && !canRequestChanges)
                  || (action === 'changes_requested' && !note.trim())}
                onClick={() => void confirmDecision()}
                type="button"
              >
                {pending ? 'Saving...' : `Confirm ${action === 'approved' ? 'approval' : 'request'}`}
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
        </div>
      )}
    </>
  )
}
