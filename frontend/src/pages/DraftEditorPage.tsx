import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { FormEvent as ReactFormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CommentsPanel } from '../components/CommentsPanel'
import { AIDisclosure } from '../components/AIDisclosure'
import { DecisionBar } from '../components/DecisionBar'
import { DiffView } from '../components/DiffView'
import { FindingsPanel } from '../components/FindingsPanel'
import { RiskBreakdown } from '../components/RiskBreakdown'
import { SelfCorrectPanel } from '../components/SelfCorrectPanel'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useAuth } from '../context/AuthContext'
import {
  addDraftComment,
  decideDraft,
  DraftNotFoundError,
  getActivityFeed,
  getDraftDetail,
  reviewDraft,
  restoreDraftVersion,
  submitDraft,
  updateDraftContent,
  updateFinding,
} from '../lib/api'
import type { ActivityEvent, DraftDetail, DraftVersion, Finding, FindingStatus, ReviewRisk } from '../types'
import './drafts.css'

interface VersionComparisonOption {
  id: string
  content: string
  label: string
  current: boolean
}

function versionTimestamp(value?: string): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatVersionTimestamp(value?: string): string {
  const timestamp = versionTimestamp(value)
  if (timestamp === null) return 'Timestamp unavailable'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function VersionHistoryBrowser({
  draftId,
  versions,
  currentContent,
  canRestore,
  restoringVersionId,
  onRestoreVersion,
}: {
  draftId: string
  versions: readonly DraftVersion[]
  currentContent: string
  canRestore: boolean
  restoringVersionId: string | null
  onRestoreVersion: (version: DraftVersion, label: string) => void
}) {
  const [fromVersionId, setFromVersionId] = useState<string | null>(null)
  const [toVersionId, setToVersionId] = useState<string | null>(null)
  const orderedVersions = versions
    .map((version, index) => ({ version, index, timestamp: versionTimestamp(version.createdAt) }))
    .sort((first, second) => {
      if (first.timestamp !== null && second.timestamp !== null) {
        return first.timestamp - second.timestamp || first.index - second.index
      }
      if (first.timestamp !== null) return -1
      if (second.timestamp !== null) return 1
      return first.index - second.index
    })
  const currentVersionId = [...orderedVersions]
    .reverse()
    .find(({ version }) => version.content === currentContent)?.version.id ?? null

  const options: VersionComparisonOption[] = orderedVersions.map(({ version }, index) => ({
    id: `version:${version.id}`,
    content: version.content,
    label: `Version ${index + 1}`,
    current: version.id === currentVersionId,
  }))
  if (versions.length > 0 && currentVersionId === null) {
    options.push({
      id: `current-draft:${draftId}`,
      content: currentContent,
      label: 'Current draft (not a saved version)',
      current: true,
    })
  }

  const firstOption = options[0]
  const currentOption = options.find((option) => option.current)
  const lastOption = options[options.length - 1]
  const defaultFrom = firstOption
  const defaultTo = options.length > 1 ? currentOption ?? lastOption : firstOption
  const fromVersion = options.find((option) => option.id === fromVersionId) ?? defaultFrom
  const toVersion = options.find((option) => option.id === toVersionId) ?? defaultTo

  return (
    <section aria-labelledby={`version-history-title-${draftId}`} className="version-history">
      <h3 id={`version-history-title-${draftId}`}>Version history</h3>
      {orderedVersions.length === 0 ? (
        <p className="version-history-empty" role="status">
          No saved versions are available for this draft yet.
        </p>
      ) : (
        <>
          {currentVersionId === null && (
            <p className="version-history-current-note">
              <strong>Current draft (not a saved version).</strong>{' '}
              This content is not in the saved history. It is available for comparison as
              “Current draft” and is not shown as a saved version.
            </p>
          )}
          <ol aria-label="Saved draft versions" className="version-history-list">
            {orderedVersions.map(({ version, timestamp }, index) => (
              <li className="version-history-item" key={version.id}>
                <div className="version-history-item-heading">
                  <strong>Version {index + 1}</strong>
                  {version.id === currentVersionId && (
                    <span className="version-current-label">Current version</span>
                  )}
                </div>
                <time dateTime={timestamp === null ? undefined : version.createdAt}>
                  {formatVersionTimestamp(version.createdAt)}
                </time>
                {version.note?.trim() && <p>{version.note}</p>}
                {canRestore && version.id !== currentVersionId && (
                  <div className="version-history-item-actions">
                    <button
                      aria-busy={restoringVersionId === version.id}
                      aria-label={`Restore Version ${index + 1} to the draft`}
                      className="secondary-button"
                      disabled={restoringVersionId !== null}
                      onClick={() => {
                        const label = `Version ${index + 1}`
                        const confirmed = window.confirm(
                          `Restore ${label} to this draft? This will replace the current content and add a new version. Existing history will not be deleted.`,
                        )
                        if (confirmed) onRestoreVersion(version, label)
                      }}
                      type="button"
                    >
                      {restoringVersionId === version.id ? 'Restoring...' : `Restore Version ${index + 1}`}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {options.length > 1 ? (
            <div className="version-comparison">
              <h4>Compare versions</h4>
              <div className="version-comparison-controls">
                <div className="filter-field">
                  <label htmlFor={`version-from-${draftId}`}>Compare from</label>
                  <select
                    id={`version-from-${draftId}`}
                    onChange={(event) => setFromVersionId(event.target.value)}
                    value={fromVersion?.id ?? ''}
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}{option.current ? ' — Current' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-field">
                  <label htmlFor={`version-to-${draftId}`}>Compare to</label>
                  <select
                    id={`version-to-${draftId}`}
                    onChange={(event) => setToVersionId(event.target.value)}
                    value={toVersion?.id ?? ''}
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}{option.current ? ' — Current' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {fromVersion && toVersion && fromVersion.id === toVersion.id ? (
                <p className="version-history-empty" role="status">
                  Choose two different versions to compare.
                </p>
              ) : fromVersion && toVersion ? (
                <div className="version-diff-result">
                  <h4 aria-atomic="true" aria-live="polite">
                    Comparison: {fromVersion.label} to {toVersion.label}
                  </h4>
                  <p className="version-diff-key">
                    <span className="diff-change-label">Removed</span> from the first version
                    <span aria-hidden="true"> · </span>
                    <span className="diff-change-label">Added</span> in the second version
                  </p>
                  <DiffView
                    currentContent={toVersion.content}
                    previousContent={fromVersion.content}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="version-history-empty" role="status">
              No earlier version is available to compare yet.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function findQuoteRanges(text: string, findings: readonly Finding[], baseOffset: number) {
  return findings
    .map((finding) => {
      const startOffset = finding.startOffset
      const endOffset = finding.endOffset
      const offsetStart = startOffset === undefined ? -1 : startOffset - baseOffset
      const hasMatchingOffsets = startOffset !== undefined
        && endOffset !== undefined
        && offsetStart >= 0
        && endOffset - startOffset === finding.quote.length
        && text.slice(offsetStart, offsetStart + finding.quote.length) === finding.quote
      return { finding, start: hasMatchingOffsets ? offsetStart : text.indexOf(finding.quote) }
    })
    .filter((match) => match.start >= 0)
    .sort((first, second) => first.start - second.start)
}

function DraftCopy({
  content,
  findings,
  selectedFindingId,
  onSelectFinding,
}: {
  content: string
  findings: readonly Finding[]
  selectedFindingId: string | null
  onSelectFinding: (findingId: string) => void
}) {
  const paragraphs = content.split('\n\n').map((paragraph, index, allParagraphs) => ({
    paragraph,
    offset: allParagraphs
      .slice(0, index)
      .reduce((offset, previous) => offset + previous.length + 2, 0),
  }))

  return (
    <div className="draft-copy">
      {paragraphs.map(({ paragraph, offset: paragraphOffset }, paragraphIndex) => {
        const paragraphFindings = findings.filter((finding) => {
          const overlapsParagraph = finding.startOffset !== undefined
            && finding.endOffset !== undefined
            && finding.startOffset < paragraphOffset + paragraph.length
            && finding.endOffset > paragraphOffset
          return overlapsParagraph || paragraph.includes(finding.quote)
        })
        const ranges = findQuoteRanges(paragraph, paragraphFindings, paragraphOffset)
        const parts: React.ReactNode[] = []
        let cursor = 0

        ranges.forEach(({ finding, start }) => {
          if (start < cursor) return
          if (start > cursor) parts.push(paragraph.slice(cursor, start))
          parts.push(
            <mark
              aria-label={`Select finding: ${finding.category}, ${finding.severity} severity. ${finding.quote}`}
              aria-pressed={finding.id === selectedFindingId}
              className={`draft-highlight${finding.id === selectedFindingId ? ' is-selected' : ''}`}
              id={`draft-highlight-${finding.id}`}
              key={finding.id}
              onClick={() => onSelectFinding(finding.id)}
              onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectFinding(finding.id)
                }
              }}
              role="button"
              tabIndex={0}
            >
              {finding.quote}
            </mark>,
          )
          cursor = start + finding.quote.length
        })

        if (cursor < paragraph.length) parts.push(paragraph.slice(cursor))
        return <p key={`${paragraphIndex}-${paragraph.slice(0, 20)}`}>{parts}</p>
      })}
    </div>
  )
}

type EditorView = 'draft' | 'changes'

function formatActivityAction(action: string) {
  const labels: Record<string, string> = {
    finding_accepted: 'Finding accepted',
    finding_dismissed: 'Finding dismissed',
    decision_approved: 'Draft approved',
    decision_changes_requested: 'Changes requested',
    submitted_for_review: 'Draft submitted for review',
    draft_edited: 'Draft edited',
    comment_added: 'Comment added',
    review_run: 'AI review completed',
  }
  return labels[action] ?? action.replaceAll('_', ' ')
}

function findingDecisionDetails(event: ActivityEvent, findings: readonly Finding[]) {
  const [, sourceId = '', rawReason = ''] = /^([^:]+):(.*)$/s.exec(event.detail) ?? []
  const source = sourceId.trim()
  const finding = findings.find(
    (item) => source && (item.sourceName.endsWith(`(${source})`) || item.sourceName === source),
  )

  return {
    findingName: finding ? `${finding.category} finding` : source ? `Finding ${source}` : 'Finding',
    reason: event.action === 'finding_dismissed' ? rawReason.trim() : '',
  }
}

function DraftEditor({ initialDetail }: { initialDetail: DraftDetail }) {
  const { user } = useAuth()
  const userIdentity = `${user?.id ?? ''}:${user?.role ?? ''}`
  const [detail, setDetail] = useState(initialDetail)
  const [draftText, setDraftText] = useState(initialDetail.draft.content)
  const [detailUserIdentity, setDetailUserIdentity] = useState<string | null>(userIdentity)
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [selfCorrectOpen, setSelfCorrectOpen] = useState(false)
  const [selfCorrectBusy, setSelfCorrectBusy] = useState(false)
  const [suggestionNotice, setSuggestionNotice] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewRisk, setReviewRisk] = useState<ReviewRisk | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [mutationSuccess, setMutationSuccess] = useState<string | null>(null)
  const [mutating, setMutating] = useState(false)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [activityError, setActivityError] = useState<string | null>(null)
  const [dismissalFindingId, setDismissalFindingId] = useState<string | null>(null)
  const [dismissalReason, setDismissalReason] = useState('')
  const [dismissalReasonError, setDismissalReasonError] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState(false)
  const [view, setView] = useState<EditorView>('draft')
  const dismissalReasonInput = useRef<HTMLTextAreaElement>(null)
  const previousUserIdentity = useRef(userIdentity)
  const roleRefreshRef = useRef<{
    controller: AbortController
    completion: Promise<void>
  } | null>(null)
  const { draft, findings: draftFindings } = detail
  const workflowDecisions = detail.decisions.filter(
    (decision) => decision.type === 'approved' || decision.type === 'changes_requested',
  )
  const dismissalFinding = draftFindings.find((finding) => finding.id === dismissalFindingId)
  const workflowStatusConfirmed = detailUserIdentity === userIdentity
  const canEditDraft = user?.role === 'author'
    && (draft.status === 'draft' || draft.status === 'changes_requested')
  const selfCorrectEnabled = import.meta.env.VITE_ENABLE_SELF_CORRECT === 'true'
    || import.meta.env.VITE_MOCK_SELF_CORRECT === 'true'
  // Restore needs a backend endpoint that is not confirmed as deployed. Keep it off until
  // VITE_ENABLE_RESTORE is set to "true".
  const restoreEnabled = (import.meta.env as Record<string, string | undefined>).VITE_ENABLE_RESTORE === 'true'
  const canRestoreDraft = restoreEnabled && user?.role === 'author' && canEditDraft && workflowStatusConfirmed
  const hasOpenHighFinding = draftFindings.some(
    (finding) => finding.severity === 'high' && finding.status === 'open',
  )

  const refreshDetail = useCallback(async () => {
    const updatedDetail = await getDraftDetail(draft.id)
    setDetail(updatedDetail)
    return updatedDetail
  }, [draft.id])

  const refreshActivity = useCallback(async () => {
    try {
      const events = await getActivityFeed()
      const draftEvents = events.filter((event) => event.draftId === draft.id)
      setActivity(draftEvents)
      setActivityError(null)
      return draftEvents
    } catch (failure) {
      setActivityError(
        failure instanceof Error ? failure.message : 'The activity feed could not be loaded.',
      )
      return []
    }
  }, [draft.id])

  useEffect(() => {
    let active = true
    getActivityFeed()
      .then((events) => {
        if (active) {
          setActivity(events.filter((event) => event.draftId === draft.id))
          setActivityError(null)
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setActivityError(
            failure instanceof Error ? failure.message : 'The activity feed could not be loaded.',
          )
        }
      })

    return () => {
      active = false
    }
  }, [draft.id])

  useEffect(() => {
    if (previousUserIdentity.current === userIdentity) return
    previousUserIdentity.current = userIdentity

    const previousRefresh = roleRefreshRef.current
    previousRefresh?.controller.abort()

    if (!userIdentity) return

    const controller = new AbortController()

    const completion = (async () => {
      if (previousRefresh) await previousRefresh.completion
      if (controller.signal.aborted) return

      try {
        const updatedDetail = await getDraftDetail(draft.id, controller.signal)
        if (!controller.signal.aborted) {
          setDetail(updatedDetail)
          setDraftText(updatedDetail.draft.content)
          setEditingDraft(false)
          setDetailUserIdentity(userIdentity)
          setMutationError(null)
        }
      } catch (refreshFailure) {
        if (!controller.signal.aborted) {
          setMutationError(
            refreshFailure instanceof Error
              ? refreshFailure.message
              : 'The draft status could not be refreshed.',
          )
        }
      }
    })()
    roleRefreshRef.current = { controller, completion }

    return () => {
      controller.abort()
    }
  }, [draft.id, userIdentity])

  async function saveCurrentContent() {
    if (!user) throw new Error('Sign in to update this draft.')
    if (draftText === draft.content) return
    if (user.role !== 'author') {
      throw new Error('Only the author can update draft content.')
    }
    await updateDraftContent(draft.id, draftText, user.name, user.role)
  }

  function cancelDraftEdit() {
    setDraftText(draft.content)
    setEditingDraft(false)
    setMutationError(null)
  }

  async function saveDraftEdit() {
    if (!user || user.role !== 'author' || !canEditDraft || mutating) return
    setMutating(true)
    setMutationError(null)
    setMutationSuccess(null)
    try {
      await saveCurrentContent()
      const updatedDetail = await refreshDetail()
      if (updatedDetail.draft.content !== draftText) {
        throw new Error('The saved content does not match the latest draft returned by the API.')
      }
      setDraftText(updatedDetail.draft.content)
      setEditingDraft(false)
      await refreshActivity()
      setMutationSuccess('Draft content saved.')
      setAnnouncement('Draft content saved')
    } catch (saveFailure) {
      setMutationError(
        saveFailure instanceof Error ? saveFailure.message : 'The draft content could not be saved.',
      )
    } finally {
      setMutating(false)
    }
  }

  async function restoreVersion(version: DraftVersion, label: string) {
    if (!user || !canRestoreDraft || mutating) return
    setMutating(true)
    setRestoringVersionId(version.id)
    setMutationError(null)
    setMutationSuccess(null)
    let restoreConfirmed = false
    try {
      const restoredDraft = await restoreDraftVersion(draft.id, version.id, user.name, user.role)
      restoreConfirmed = true
      setDetail((currentDetail) => ({ ...currentDetail, draft: restoredDraft }))
      setDraftText(restoredDraft.content)
      const updatedDetail = await refreshDetail()
      setDraftText(updatedDetail.draft.content)
      await refreshActivity()
      setMutationSuccess(`${label} restored. A new version was added to history.`)
      setAnnouncement(`${label} restored`)
    } catch (restoreFailure) {
      const failureMessage = restoreFailure instanceof Error
        ? restoreFailure.message
        : 'The selected version could not be restored.'
      setMutationError(
        restoreConfirmed
          ? `The version was restored, but the latest draft details could not be refreshed: ${failureMessage}`
          : failureMessage,
      )
    } finally {
      setRestoringVersionId(null)
      setMutating(false)
    }
  }

  async function runReview() {
    setReviewing(true)
    setMutating(true)
    setReviewError(null)
    setMutationError(null)
    setAnnouncement('Running AI review')
    try {
      await saveCurrentContent()
      const reviewResult = await reviewDraft(draft.id)
      setReviewRisk(reviewResult.risk)
      await refreshDetail()
      await refreshActivity()
      setSelectedFindingId(null)
      setAnnouncement('AI review complete')
    } catch (reviewFailure) {
      setReviewError(
        reviewFailure instanceof Error
          ? reviewFailure.message
          : 'The AI review could not be completed. Please try again.',
      )
      setAnnouncement('AI review unavailable')
    } finally {
      setReviewing(false)
      setMutating(false)
    }
  }

  function applySuggestedContent(content: string) {
    setDetail((currentDetail) => ({
      ...currentDetail,
      draft: { ...currentDetail.draft, content },
    }))
    setDraftText(content)
    setEditingDraft(false)
    setSelfCorrectOpen(false)
    setSelfCorrectBusy(false)
    setSuggestionNotice('Draft changed. Run AI review again to refresh findings.')
    setAnnouncement('Suggestion applied')
  }

  function selectFinding(
    findingId: string,
    origin: 'card' | 'highlight',
    shouldFocus = false,
  ) {
    setSelectedFindingId(findingId)
    const targetPrefix = origin === 'card' ? 'draft-highlight' : 'finding-card'
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`${targetPrefix}-${findingId}`)
      target?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      })
      if (shouldFocus) target?.focus()
    })
  }

  const changeFindingStatus = useCallback(async (
    findingId: string,
    status: FindingStatus,
    reason?: string,
  ): Promise<boolean> => {
    if (!user) return false
    setMutating(true)
    setMutationError(null)
    setMutationSuccess(null)
    try {
      const finding = draftFindings.find((item) => item.id === findingId)
      if (!finding) throw new Error('The selected finding is no longer available.')
      if (status === 'dismissed' && !reason?.trim()) {
        throw new Error('A reason is required to dismiss a finding.')
      }
      const savedFinding = await updateFinding(
        finding.id,
        finding.draftId,
        status,
        user.name,
        user.role,
        reason?.trim(),
      )
      if (savedFinding.id !== finding.id || savedFinding.status !== status) {
        throw new Error(`The API did not confirm the ${status} status for finding ${finding.id}.`)
      }
      const updatedDetail = await refreshDetail()
      const updatedFinding = updatedDetail.findings.find((item) => item.id === findingId)
      if (updatedFinding?.status !== status) {
        throw new Error(`The API did not persist the ${status} status for finding ${findingId}.`)
      }
      const changedFinding = draftFindings.find((item) => {
        if (item.id === findingId) return false
        const updated = updatedDetail.findings.find((current) => current.id === item.id)
        return updated?.status !== item.status
      })
      if (changedFinding) {
        throw new Error(
          `The API changed finding ${changedFinding.id} while updating ${findingId}. No success was reported; reload the draft and check its findings.`,
        )
      }
      await refreshActivity()
      setAnnouncement(status === 'accepted' ? 'Finding accepted' : 'Finding dismissed')
      setMutationSuccess(status === 'accepted' ? 'Finding accepted.' : 'Finding dismissed.')
      return true
    } catch (failure) {
      setMutationSuccess(null)
      setMutationError(
        failure instanceof Error ? failure.message : 'The finding could not be updated.',
      )
      return false
    } finally {
      setMutating(false)
    }
  }, [draftFindings, refreshActivity, refreshDetail, user])

  const requestFindingStatusChange = useCallback((findingId: string, status: FindingStatus) => {
    if (status === 'dismissed') {
      setDismissalFindingId(findingId)
      setDismissalReason('')
      setDismissalReasonError(null)
      setMutationError(null)
      setMutationSuccess(null)
      return
    }
    void changeFindingStatus(findingId, status)
  }, [changeFindingStatus])

  async function confirmFindingDismissal(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = dismissalReason.trim()
    if (!reason) {
      setDismissalReasonError('Enter a reason before dismissing this finding.')
      return
    }
    if (!dismissalFindingId) return
    setDismissalReasonError(null)
    if (await changeFindingStatus(dismissalFindingId, 'dismissed', reason)) {
      setDismissalFindingId(null)
      setDismissalReason('')
    }
  }

  function closeDismissalDialog() {
    setDismissalFindingId(null)
    setDismissalReason('')
    setDismissalReasonError(null)
  }

  useEffect(() => {
    if (dismissalFindingId) dismissalReasonInput.current?.focus()
  }, [dismissalFindingId])

  function changeViewOnKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const tabButtons = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])]
    const currentIndex = tabButtons.indexOf(event.currentTarget)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabButtons.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = tabButtons[nextIndex]
    nextTab?.focus()
    setView(nextTab?.id === 'changes-tab' ? 'changes' : 'draft')
  }

  async function recordDecision(type: string, note: string) {
    if (!user) throw new Error('Sign in to record a decision.')
    setMutating(true)
    setMutationError(null)
    setMutationSuccess(null)
    try {
      const currentDetail = await refreshDetail()
      if (currentDetail.draft.status !== 'in_review') {
        throw new Error(
          `This draft is ${currentDetail.draft.status.replace('_', ' ')}, not in review. Refresh the draft before recording a decision.`,
        )
      }
      if (draftText !== currentDetail.draft.content) {
        throw new Error(
          'The draft has unsaved content changes. Return to the author to save and submit it for review again before recording a decision.',
        )
      }
      const previousDecisionCount = currentDetail.decisions.length
      await decideDraft(draft.id, type, user.name, user.role, note)
      const updatedDetail = await refreshDetail()
      const expectedStatus = type === 'approved' ? 'approved' : 'changes_requested'
      if (updatedDetail.draft.status !== expectedStatus) {
        throw new Error(
          `The decision request succeeded, but the backend status is "${updatedDetail.draft.status}" instead of "${expectedStatus}".`,
        )
      }
      const recorded = updatedDetail.decisions.length > previousDecisionCount
        && updatedDetail.decisions.some((decision) => (
          decision.type === type
          && decision.byName === user.name
          && decision.byRole === user.role
          && (decision.note ?? '') === note
        ))
      if (!recorded) {
        throw new Error(
          `The decision request succeeded, but the backend did not return the ${type} decision in history.`,
        )
      }
      await refreshActivity()
      setAnnouncement(type === 'approved' ? 'Draft approved' : 'Changes requested')
    } catch (decisionFailure) {
      try {
        await refreshDetail()
      } catch (refreshFailure) {
        setDetailUserIdentity(null)
        const decisionMessage = decisionFailure instanceof Error
          ? decisionFailure.message
          : 'The decision could not be recorded.'
        const refreshMessage = refreshFailure instanceof Error
          ? refreshFailure.message
          : 'Unknown refresh error.'
        throw new Error(
          `${decisionMessage} The latest workflow status could not be refreshed: ${refreshMessage}`,
          { cause: refreshFailure },
        )
      }
      throw decisionFailure
    } finally {
      setMutating(false)
    }
  }

  async function submitCurrentDraft() {
    if (!user) throw new Error('Sign in to submit this draft.')
    setMutating(true)
    setMutationError(null)
    try {
      await saveCurrentContent()
      const submittedDraft = await submitDraft(draft.id, user.name, user.role)
      if (submittedDraft.status !== 'in_review') {
        throw new Error(
          `The backend returned status "${submittedDraft.status}" after submission instead of "in_review".`,
        )
      }
      const updatedDetail = await refreshDetail()
      if (updatedDetail.draft.status !== 'in_review') {
        throw new Error(
          `The draft was submitted, but its persisted status is "${updatedDetail.draft.status}" instead of "in_review".`,
        )
      }
      await refreshActivity()
      setAnnouncement('Draft submitted')
    } finally {
      setMutating(false)
    }
  }

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (
        event.target instanceof HTMLElement
        && (event.target.isContentEditable || event.target.closest('input, textarea, select, [role="textbox"]'))
      ) return

      const key = event.key.toLocaleLowerCase()
      if (key === 'j' || key === 'k') {
        if (draftFindings.length === 0) return
        event.preventDefault()
        const selectedIndex = draftFindings.findIndex((finding) => finding.id === selectedFindingId)
        const nextIndex = selectedIndex < 0
          ? (key === 'j' ? 0 : draftFindings.length - 1)
          : (selectedIndex + (key === 'j' ? 1 : -1) + draftFindings.length) % draftFindings.length
        const nextFinding = draftFindings[nextIndex]
        if (nextFinding) selectFinding(nextFinding.id, 'highlight', true)
      } else if (key === 'a' || key === 'd') {
        const selectedFinding = draftFindings.find((finding) => finding.id === selectedFindingId)
        if (!selectedFinding) return
        event.preventDefault()
        requestFindingStatusChange(selectedFinding.id, key === 'a' ? 'accepted' : 'dismissed')
      }
    }

    window.addEventListener('keydown', handleEditorShortcut)
    return () => window.removeEventListener('keydown', handleEditorShortcut)
  }, [draftFindings, requestFindingStatusChange, selectedFindingId])

  if (!user) return <EmptyState description="Sign in to review this draft." title="Sign in required" />

  return (
    <div className="draft-editor-page">
      <header className="editor-heading">
        <Link className="back-link" to="/drafts">&#8592; All drafts</Link>
        <div className="editor-title-row">
          <div>
            <p className="eyebrow">DRAFT REVIEW</p>
            <h1>{draft.title}</h1>
            <p className="editor-author">By {draft.author}</p>
          </div>
          <span className={`status-badge status-${draft.status}`}>{draft.status.replace('_', ' ')}</span>
        </div>
      </header>

      <div className="editor-columns">
        <section className="draft-document" aria-labelledby="draft-content-heading">
          <div className="document-heading">
            <h2 id="draft-content-heading">Draft content</h2>
            <span>{draftFindings.length} findings</span>
          </div>
          {editingDraft && canEditDraft ? (
            <div className="draft-editor-field">
              <label htmlFor="draft-text">Edit draft text</label>
              <textarea
                autoFocus
                disabled={mutating}
                id="draft-text"
                onChange={(event) => setDraftText(event.target.value)}
                value={draftText}
              />
              <div className="draft-edit-actions">
                <button
                  className="logout-button"
                  disabled={mutating}
                  onClick={cancelDraftEdit}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={mutating || !canEditDraft || draftText === draft.content}
                  onClick={() => void saveDraftEdit()}
                  type="button"
                >
                  {mutating ? 'Saving...' : 'Save draft'}
                </button>
              </div>
            </div>
          ) : canEditDraft ? (
            <div className="draft-editor-field">
              <button
                className="secondary-button"
                disabled={mutating || !workflowStatusConfirmed}
                onClick={() => {
                  setDraftText(draft.content)
                  setEditingDraft(true)
                  setMutationError(null)
                  setMutationSuccess(null)
                }}
                type="button"
              >
                Edit draft text
              </button>
            </div>
          ) : null}
          <div aria-label="Draft view" className="view-tabs" role="tablist">
            <button
              aria-controls="draft-tab-panel"
              aria-selected={view === 'draft'}
              className="view-tab"
              id="draft-tab"
              onClick={() => setView('draft')}
              onKeyDown={changeViewOnKeyDown}
              role="tab"
              tabIndex={view === 'draft' ? 0 : -1}
              type="button"
            >
              Draft
            </button>
            <button
              aria-controls="draft-tab-panel"
              aria-selected={view === 'changes'}
              className="view-tab"
              id="changes-tab"
              onClick={() => setView('changes')}
              onKeyDown={changeViewOnKeyDown}
              role="tab"
              tabIndex={view === 'changes' ? 0 : -1}
              type="button"
            >
              Changes
            </button>
          </div>
          <div
            aria-labelledby={view === 'draft' ? 'draft-tab' : 'changes-tab'}
            className="view-tab-panel"
            id="draft-tab-panel"
            role="tabpanel"
            tabIndex={0}
          >
            {view === 'draft' ? (
              <DraftCopy
                content={draftText}
                findings={draftFindings}
                onSelectFinding={(findingId) => selectFinding(findingId, 'highlight')}
                selectedFindingId={selectedFindingId}
              />
            ) : (
              <VersionHistoryBrowser
                canRestore={canRestoreDraft}
                draftId={draft.id}
                key={`${draft.id}:${detail.versions.map((version) => version.id).join(',')}`}
                onRestoreVersion={(version, label) => void restoreVersion(version, label)}
                restoringVersionId={restoringVersionId}
                versions={detail.versions}
                currentContent={draftText}
              />
            )}
          </div>
        </section>

        <div className="editor-side-content">
          <p className="editor-hint">Select a highlighted quote or a finding to see why it was flagged.</p>
          <div className="review-controls">
            <button
              aria-busy={reviewing}
              className="primary-button"
              disabled={reviewing || mutating || selfCorrectBusy}
              onClick={() => void runReview()}
              type="button"
            >
              {reviewing ? 'Reviewing...' : 'Run AI review'}
            </button>
            {selfCorrectEnabled && canEditDraft && workflowStatusConfirmed && (
              <button
                aria-busy={selfCorrectBusy}
                className="secondary-button"
                disabled={reviewing || mutating || selfCorrectBusy || draftText !== draft.content}
                onClick={() => {
                  setSuggestionNotice(null)
                  setSelfCorrectBusy(true)
                  setSelfCorrectOpen(true)
                }}
                type="button"
              >
                {selfCorrectBusy ? 'Checking...' : 'Suggest a corrected draft'}
              </button>
            )}
          </div>
                <AIDisclosure />
                {selfCorrectEnabled && canEditDraft && draftText !== draft.content && (
            <p className="self-correct-save-hint">Save your edits before requesting a suggestion.</p>
          )}
          {selfCorrectEnabled && selfCorrectOpen && canEditDraft && workflowStatusConfirmed && (
            <SelfCorrectPanel
              draftId={draft.id}
              onApplied={applySuggestedContent}
              onBusyChange={setSelfCorrectBusy}
              onDismiss={() => {
                setSelfCorrectOpen(false)
                setSelfCorrectBusy(false)
              }}
              originalContent={draftText}
              user={user}
            />
          )}
          {suggestionNotice && <p className="review-notice" role="status">{suggestionNotice}</p>}
          {reviewError && (
            <ErrorState
              description={reviewError}
              onRetry={() => void runReview()}
              title="AI review unavailable"
            />
          )}
          {mutationError && <p className="review-notice" role="alert">{mutationError}</p>}
          {reviewRisk && <RiskBreakdown risk={reviewRisk} />}
          <details className="keyboard-shortcuts">
            <summary>Keyboard shortcuts</summary>
            <ul>
              <li><kbd>J</kbd> / <kbd>K</kbd> Move to next / previous finding</li>
              <li><kbd>A</kbd> Accept the selected finding</li>
              <li><kbd>D</kbd> Dismiss the selected finding</li>
            </ul>
            <p>Shortcuts are paused while typing in a text field.</p>
          </details>
          <FindingsPanel
            disabled={mutating || selfCorrectBusy}
            findings={draftFindings}
            onSelectFinding={(findingId) => selectFinding(findingId, 'card')}
            onStatusChange={requestFindingStatusChange}
            selectedFindingId={selectedFindingId}
          />
          <CommentsPanel
            findings={draftFindings}
            comments={detail.comments}
            onPost={async (text, findingId) => {
              await addDraftComment(draft.id, user.name, user.role, text, findingId)
              await refreshDetail()
              await refreshActivity()
            }}
          />
        </div>
      </div>

      <section aria-labelledby="activity-feed-heading" className="activity-feed decision-history">
        <h2 id="activity-feed-heading">Activity Feed</h2>
        {activityError ? (
          <p role="alert">
            {activityError}{' '}
            <button onClick={() => void refreshActivity()} type="button">Retry</button>
          </p>
        ) : activity.length === 0 ? (
          <p>No activity recorded for this draft.</p>
        ) : (
          <ol>
            {activity.map((event) => (
              <li key={event.id}>
                <strong>{formatActivityAction(event.action)}</strong>
                <span> by {event.actor} ({event.role})</span>
                <time dateTime={event.createdAt}>
                  {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt))}
                </time>
                {event.detail && <p>{event.detail}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="finding-decision-history-heading" className="decision-history">
        <h2 id="finding-decision-history-heading">Finding Decision History</h2>
        <p>Accept and Dismiss actions are recorded from the persisted activity log.</p>
        {activityError ? (
          <p role="alert">
            {activityError}{' '}
            <button onClick={() => void refreshActivity()} type="button">Retry</button>
          </p>
        ) : activity.filter((event) => (
          event.action === 'finding_accepted' || event.action === 'finding_dismissed'
        )).length === 0 ? (
          <p>No finding decisions recorded for this draft.</p>
        ) : (
          <ol>
            {activity
              .filter((event) => (
                event.action === 'finding_accepted' || event.action === 'finding_dismissed'
              ))
              .map((event) => {
                const details = findingDecisionDetails(event, draftFindings)
                return (
                  <li key={event.id}>
                    <strong>
                      {details.findingName}: {event.action === 'finding_accepted' ? 'Accepted' : 'Dismissed'}
                    </strong>
                    <span> by {event.actor} ({event.role})</span>
                    <time dateTime={event.createdAt}>
                      {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt))}
                    </time>
                    {details.reason && <p>Dismissal reason: {details.reason}</p>}
                  </li>
                )
              })}
          </ol>
        )}
      </section>

      <section aria-labelledby="decision-history-heading" className="decision-history">
        <h2 id="decision-history-heading">Workflow Decision History</h2>
        <p>Approve and Request Changes actions are recorded here.</p>
        {workflowDecisions.length === 0 ? (
          <p>No decisions recorded for this draft.</p>
        ) : (
          <ol>
            {workflowDecisions.map((decision) => (
              <li key={decision.id}>
                <strong>
                  {decision.type === 'approved'
                    ? 'Approved'
                    : 'Changes requested'}
                </strong>
                <span> by {decision.byName} ({decision.byRole})</span>
                <time dateTime={decision.createdAt}>
                  {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(decision.createdAt))}
                </time>
                {decision.note && <p>{decision.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {mutationSuccess && <p className="review-notice" role="status">{mutationSuccess}</p>}
      <DecisionBar
        hasOpenHighFinding={hasOpenHighFinding}
        onConfirm={recordDecision}
        onSubmit={submitCurrentDraft}
        status={draft.status}
        statusConfirmed={workflowStatusConfirmed}
        user={user}
        submitting={mutating || !workflowStatusConfirmed}
      />
      {dismissalFinding && (
        <div className="dialog-backdrop">
          <form
            aria-labelledby="dismissal-dialog-title"
            aria-modal="true"
            className="decision-dialog"
            noValidate
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !mutating) closeDismissalDialog()
            }}
            onSubmit={(event) => void confirmFindingDismissal(event)}
            role="dialog"
          >
            <h2 id="dismissal-dialog-title">Dismiss this finding?</h2>
            <p>
              Add a reason for dismissing “{dismissalFinding.category}”. The status and reason will
              be saved with the finding.
            </p>
            <label htmlFor="finding-dismissal-reason">Reason for dismissal</label>
            <textarea
              aria-describedby={dismissalReasonError ? 'finding-dismissal-error' : undefined}
              aria-invalid={Boolean(dismissalReasonError)}
              aria-required="true"
              id="finding-dismissal-reason"
              onChange={(event) => {
                setDismissalReason(event.target.value)
                setDismissalReasonError(null)
              }}
              ref={dismissalReasonInput}
              rows={4}
              value={dismissalReason}
            />
            {dismissalReasonError && (
              <p id="finding-dismissal-error" role="alert">{dismissalReasonError}</p>
            )}
            {mutationError && <p role="alert">{mutationError}</p>}
            <div className="dialog-actions">
              <button
                className="logout-button"
                disabled={mutating}
                onClick={closeDismissalDialog}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={mutating}
                type="submit"
              >
                {mutating ? 'Saving...' : 'Confirm dismissal'}
              </button>
            </div>
          </form>
        </div>
      )}
      <p aria-atomic="true" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  )
}

export function DraftEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<DraftDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draftNotFound, setDraftNotFound] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function loadDraft() {
      try {
        if (!id) throw new Error('This draft could not be found.')
        const loadedDetail = await getDraftDetail(id, controller.signal)
        if (active) {
          setDetail(loadedDetail)
          setError(null)
          setDraftNotFound(false)
        }
      } catch (loadError) {
        if (active) {
          setDetail(null)
          setDraftNotFound(loadError instanceof DraftNotFoundError)
          setError(loadError instanceof Error ? loadError.message : 'Draft could not be loaded. Please try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDraft()

    return () => {
      active = false
      controller.abort()
    }
  }, [attempt, id])

  function retry() {
    setLoading(true)
    setAttempt((currentAttempt) => currentAttempt + 1)
  }

  if (loading) return <LoadingState label="Loading draft" layout="editor" />
  if (draftNotFound) {
    return (
      <EmptyState
        action={<Link className="text-link" to="/drafts">Back to drafts</Link>}
        description={`No live draft is available for "${id ?? 'this URL'}".`}
        title="Draft not found"
      />
    )
  }
  if (error || !detail) {
    return (
      <ErrorState
        description={error ?? 'Draft could not be loaded. Please try again.'}
        onRetry={retry}
        title="Draft is unavailable"
      />
    )
  }

  return <DraftEditor initialDetail={detail} key={detail.draft.id} />
}
