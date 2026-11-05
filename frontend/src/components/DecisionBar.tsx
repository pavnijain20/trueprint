import { useEffect, useRef, useState } from 'react'
import type { Decision, DraftStatus, User } from '../types'

type DecisionType = Decision['type']

export function DecisionBar({
  draftId,
  status,
  user,
  hasOpenHighFinding,
  onConfirm,
}: {
  draftId: string
  status: DraftStatus
  user: User
  hasOpenHighFinding: boolean
  onConfirm: (decision: Decision) => void
}) {
  const [action, setAction] = useState<DecisionType | null>(null)
  const [note, setNote] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

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
      if (event.shiftKey && document.activeElement === first) {
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
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function openDialog(type: DecisionType, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setAction(type)
    setNote('')
  }

  function confirmDecision() {
    if (!action || (action === 'changes_requested' && !note.trim())) return
    const decision: Decision = {
      id: `decision-${Date.now()}`,
      draftId,
      type: action,
      byName: user.name,
      byRole: user.role,
      ...(note.trim() ? { note: note.trim() } : {}),
      createdAt: new Date().toISOString(),
    }
    onConfirm(decision)
    closeDialog()
  }

  const canDecide = user.role === 'approver' || user.role === 'admin'
  const canRequestChanges = user.role === 'reviewer' || canDecide
  if (!canRequestChanges) {
    const statusMessage = status === 'approved'
      ? 'Draft approved'
      : status === 'changes_requested'
        ? 'Changes requested'
        : 'Waiting for review'
    return (
      <aside className="decision-bar" aria-label="Review status">
        <div>
          <p className="decision-status">{statusMessage}</p>
          <p className="decision-disclaimer">AI findings are suggestions. A human makes the final decision.</p>
        </div>
      </aside>
    )
  }

  return (
    <>
      <aside className="decision-bar" aria-label="Draft decision">
        <div className="decision-copy">
          <p className="decision-status">Current status: {status.replace('_', ' ')}</p>
          <p className="decision-disclaimer">AI findings are suggestions. A human makes the final decision.</p>
        </div>
        <div className="decision-actions">
          {canDecide && (
            <div className="approve-action">
              <button
                aria-describedby={hasOpenHighFinding ? 'approval-disabled-reason' : undefined}
                className="primary-button"
                disabled={hasOpenHighFinding}
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
              onChange={(event) => setNote(event.target.value)}
              ref={noteRef}
              rows={4}
              value={note}
            />
            <div className="dialog-actions">
              <button className="logout-button" onClick={closeDialog} type="button">Cancel</button>
              <button
                className="primary-button"
                disabled={action === 'changes_requested' && !note.trim()}
                onClick={confirmDecision}
                type="button"
              >
                Confirm {action === 'approved' ? 'approval' : 'request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
