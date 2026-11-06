import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CommentsPanel } from '../components/CommentsPanel'
import { DecisionBar } from '../components/DecisionBar'
import { DiffView } from '../components/DiffView'
import { FindingsPanel } from '../components/FindingsPanel'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useAuth } from '../context/AuthContext'
import { comments as allComments } from '../data/comments'
import { findings as allFindings } from '../data/findings'
import { drafts } from '../data/drafts'
import { versions } from '../data/versions'
import { mapBackendFinding, reviewDraft } from '../lib/api'
import type { Decision, Draft, Finding, FindingStatus } from '../types'
import './drafts.css'

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

function DraftEditor({ draft }: { draft: Draft }) {
  const { user } = useAuth()
  const [draftText, setDraftText] = useState(draft.content)
  const [draftFindings, setDraftFindings] = useState<Finding[]>(() =>
    allFindings.filter((finding) => finding.draftId === draft.id).map((finding) => ({ ...finding })),
  )
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewNotice, setReviewNotice] = useState<string | null>(null)
  const [risk, setRisk] = useState<{ level: string; score: number } | null>(null)
  const [view, setView] = useState<EditorView>('draft')
  const [draftStatus, setDraftStatus] = useState(draft.status)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const draftComments = allComments.filter((comment) => comment.draftId === draft.id)
  const versionHistory = versions.find((item) => item.draftId === draft.id)
  const hasOpenHighFinding = draftFindings.some(
    (finding) => finding.severity === 'high' && finding.status === 'open',
  )

  async function runReview() {
    setReviewing(true)
    setReviewError(null)
    setReviewNotice(null)
    setRisk(null)
    setAnnouncement('Running AI review')
    try {
      const response = await reviewDraft(draftText)
      setDraftFindings(response.findings.map((finding) => mapBackendFinding(finding, draft.id)))
      setSelectedFindingId(null)
      setRisk(response.risk)
      setReviewNotice(response.error)
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
    }
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

  function changeFindingStatus(findingId: string, status: FindingStatus) {
    setDraftFindings((currentFindings) => currentFindings.map((finding) => (
      finding.id === findingId ? { ...finding, status } : finding
    )))
    setAnnouncement(status === 'accepted' ? 'Finding accepted' : 'Finding dismissed')
  }

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

  function recordDecision(decision: Decision) {
    setDecisions((current) => [decision, ...current])
    setDraftStatus(decision.type)
    setAnnouncement(decision.type === 'approved' ? 'Draft approved' : 'Changes requested')
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
        changeFindingStatus(selectedFinding.id, key === 'a' ? 'accepted' : 'dismissed')
      }
    }

    window.addEventListener('keydown', handleEditorShortcut)
    return () => window.removeEventListener('keydown', handleEditorShortcut)
  }, [draftFindings, selectedFindingId])

  if (!user) return <EmptyState description="Sign in to review this draft." title="Sign in required" />
  if (!versionHistory) {
    return (
      <EmptyState
        action={<Link className="text-link" to="/drafts">Back to drafts</Link>}
        description="The version history for this draft is not available."
        title="Draft history unavailable"
      />
    )
  }

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
          <span className={`status-badge status-${draftStatus}`}>{draftStatus.replace('_', ' ')}</span>
        </div>
      </header>

      <div className="editor-columns">
        <section className="draft-document" aria-labelledby="draft-content-heading">
          <div className="document-heading">
            <h2 id="draft-content-heading">Draft content</h2>
            <span>{draftFindings.length} findings</span>
          </div>
          <div className="draft-editor-field">
            <label htmlFor="draft-text">Edit draft text</label>
            <textarea
              id="draft-text"
              onChange={(event) => setDraftText(event.target.value)}
              value={draftText}
            />
          </div>
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
              <DiffView
                currentContent={draftText}
                previousContent={versionHistory.previous.content}
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
              disabled={reviewing}
              onClick={() => void runReview()}
              type="button"
            >
              {reviewing ? 'Reviewing...' : 'Run AI review'}
            </button>
            {risk && (
              <span className="risk-badge">
                Risk: {risk.level} ({risk.score})
              </span>
            )}
          </div>
          {reviewError && (
            <ErrorState
              description={reviewError}
              onRetry={() => void runReview()}
              title="AI review unavailable"
            />
          )}
          {reviewNotice && (
            <p className="review-notice" role="status">
              AI unavailable, rule-based checks only. {reviewNotice}
            </p>
          )}
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
            findings={draftFindings}
            onSelectFinding={(findingId) => selectFinding(findingId, 'card')}
            onStatusChange={changeFindingStatus}
            selectedFindingId={selectedFindingId}
          />
          <CommentsPanel
            draftId={draft.id}
            findings={draftFindings}
            initialComments={draftComments}
            user={user}
          />
        </div>
      </div>

      <section aria-labelledby="decision-history-heading" className="decision-history">
        <h2 id="decision-history-heading">Decision history</h2>
        {decisions.length === 0 ? (
          <p>No decisions recorded for this draft.</p>
        ) : (
          <ol>
            {decisions.map((decision) => (
              <li key={decision.id}>
                <strong>{decision.type === 'approved' ? 'Approved' : 'Changes requested'}</strong>
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

      <DecisionBar
        draftId={draft.id}
        hasOpenHighFinding={hasOpenHighFinding}
        onConfirm={recordDecision}
        status={draftStatus}
        user={user}
      />
      <p aria-atomic="true" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  )
}

export function DraftEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const timeoutId = window.setTimeout(() => {
      try {
        const loadedDraft = drafts.find((item) => item.id === id)
        if (!loadedDraft) throw new Error('This draft could not be found.')
        if (active) {
          setDraft(loadedDraft)
          setError(null)
        }
      } catch (loadError) {
        if (active) {
          setDraft(null)
          setError(loadError instanceof Error ? loadError.message : 'Draft could not be loaded. Please try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [attempt, id])

  function retry() {
    setLoading(true)
    setAttempt((currentAttempt) => currentAttempt + 1)
  }

  if (loading) return <LoadingState label="Loading draft" layout="editor" />
  if (error || !draft) {
    return (
      <ErrorState
        description={error ?? 'Draft could not be loaded. Please try again.'}
        onRetry={retry}
        title="Draft is unavailable"
      />
    )
  }

  return <DraftEditor draft={draft} key={draft.id} />
}
