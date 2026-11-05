import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { findings } from '../data/findings'
import type { DraftStatus, Role } from '../types'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { useDraftsData } from './useDraftsData'
import './drafts.css'

type StatusFilter = 'all' | DraftStatus
const quickStartKey = 'trueprint.quick-start.'

const demoDraftByRole: Record<Role, string> = {
  author: 'social-focus',
  reviewer: 'spring-campaign',
  approver: 'quarterly-release',
  admin: 'product-page',
}

const quickStartSteps: Record<Role, readonly string[]> = {
  author: [
    'Open the highlighted draft and review a finding’s reason, source, suggested fix, and confidence.',
    'Accept or dismiss findings to record your review.',
    'Compare the draft and Changes view to understand edits.',
    'Leave a comment for the reviewer, then switch roles to continue the review flow.',
  ],
  reviewer: [
    'Open the in-review draft marked Try this.',
    'Select a highlighted quote or finding to inspect its reason, source, suggested fix, and confidence.',
    'Accept or dismiss findings, then compare Draft and Changes and leave a comment.',
    'Request changes with a short note to send feedback to the author.',
  ],
  approver: [
    'Open the draft marked Try this; it has open high-severity findings.',
    'Review each finding’s reason, source, suggested fix, and confidence.',
    'Resolve every open high-severity finding, then compare Draft and Changes and leave a comment.',
    'Approve the draft or request changes with a note.',
  ],
  admin: [
    'Open the draft marked Try this and review its findings.',
    'Check the source guidance in Knowledge Base and compare Draft and Changes.',
    'Accept or dismiss findings and leave a comment for the team.',
    'Approve or request changes, then explore Insights for workspace activity.',
  ],
}

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' },
]

function formatStatus(status: DraftStatus) {
  return status.replace('_', ' ')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export function DraftsPage() {
  const { user } = useAuth()
  const { data, loading, error, retry } = useDraftsData()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [dismissedRoles, setDismissedRoles] = useState<Record<Role, boolean>>(() => {
    try {
      return {
        author: localStorage.getItem(`${quickStartKey}author`) === 'dismissed',
        reviewer: localStorage.getItem(`${quickStartKey}reviewer`) === 'dismissed',
        approver: localStorage.getItem(`${quickStartKey}approver`) === 'dismissed',
        admin: localStorage.getItem(`${quickStartKey}admin`) === 'dismissed',
      }
    } catch {
      return { author: false, reviewer: false, approver: false, admin: false }
    }
  })
  const quickStartVisible = user ? !dismissedRoles[user.role] : false

  function dismissQuickStart() {
    if (!user) return
    setDismissedRoles((current) => ({ ...current, [user.role]: true }))
    try {
      localStorage.setItem(`${quickStartKey}${user.role}`, 'dismissed')
    } catch {
      // The panel remains dismissed for this page session when storage is unavailable.
    }
  }

  const visibleDrafts = (data ?? []).filter((draft) => {
    const matchesStatus = statusFilter === 'all' || draft.status === statusFilter
    const query = search.trim().toLocaleLowerCase()
    const matchesSearch = !query || `${draft.title} ${draft.author}`.toLocaleLowerCase().includes(query)
    return matchesStatus && matchesSearch
  })

  return (
    <div className="drafts-page">
      <header className="section-heading">
        <div>
          <p className="eyebrow">CONTENT WORKSPACE</p>
          <h1>Drafts</h1>
          <p className="section-description">Review content and its brand guidance before publication.</p>
        </div>
        <span className="draft-total" aria-live="polite">
          {loading ? 'Loading drafts' : `${visibleDrafts.length} ${visibleDrafts.length === 1 ? 'draft' : 'drafts'}`}
        </span>
      </header>

      {user && (
        <section aria-label="Quick start" className="quick-start">
          {quickStartVisible ? (
            <>
              <div className="quick-start-heading">
                <div>
                  <p className="eyebrow">YOUR FIRST REVIEW</p>
                  <h2 id="quick-start-title">Quick start</h2>
                </div>
                <button className="quick-start-dismiss" onClick={dismissQuickStart} type="button">
                  Dismiss
                </button>
              </div>
              <ol>
                {quickStartSteps[user.role].map((step) => <li key={step}>{step}</li>)}
              </ol>
            </>
          ) : (
            <button
              className="show-quick-start"
              onClick={() => {
                if (!user) return
                setDismissedRoles((current) => ({ ...current, [user.role]: false }))
                try {
                  localStorage.removeItem(`${quickStartKey}${user.role}`)
                } catch {
                  // The panel is shown for this page session when storage is unavailable.
                }
              }}
              type="button"
            >
              Show quick start
            </button>
          )}
        </section>
      )}

      <form className="draft-filters" onSubmit={(event) => event.preventDefault()} role="search">
        <div className="filter-field search-field">
          <label htmlFor="draft-search">Search drafts</label>
          <input
            autoComplete="off"
            id="draft-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or author"
            type="search"
            value={search}
          />
        </div>
        <div className="filter-field status-field">
          <label htmlFor="draft-status">Status</label>
          <select
            id="draft-status"
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            value={statusFilter}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </form>

      {loading && <LoadingState label="Loading drafts" />}

      {!loading && error && (
        <ErrorState description={error} onRetry={retry} title="Drafts are unavailable" />
      )}

      {!loading && !error && visibleDrafts.length === 0 && (
        <EmptyState
          action={
            <button
              className="text-button"
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
              }}
              type="button"
            >
              Clear filters
            </button>
          }
          description="Try changing the status filter or search terms."
          title="No drafts match"
        />
      )}

      {!loading && !error && visibleDrafts.length > 0 && (
        <ul className="draft-list" aria-label="Drafts">
          {visibleDrafts.map((draft) => {
            const openFindingCount = findings.filter(
              (finding) => finding.draftId === draft.id && finding.status === 'open',
            ).length

            return (
              <li key={draft.id}>
                <Link className="draft-row" to={`/drafts/${draft.id}`}>
                  <span className="draft-main">
                    <span className="draft-title-line">
                      <span className="draft-title">{draft.title}</span>
                      {user && draft.id === demoDraftByRole[user.role] && (
                        <span className="try-this-badge">Try this</span>
                      )}
                    </span>
                    <span className="draft-author">By {draft.author}</span>
                  </span>
                  <span className={`status-badge status-${draft.status}`}>{formatStatus(draft.status)}</span>
                  <span className="finding-count">
                    <strong>{openFindingCount}</strong> open {openFindingCount === 1 ? 'finding' : 'findings'}
                  </span>
                  <span className="draft-date">
                    <span className="metadata-label">Updated</span>
                    <time dateTime={draft.updatedAt}>{formatDate(draft.updatedAt)}</time>
                  </span>
                  <span className="row-arrow" aria-hidden="true">&#8594;</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}