import { useState } from 'react'
import { Link } from 'react-router-dom'
import { findings } from '../data/findings'
import type { DraftStatus } from '../types'
import { useDraftsData } from './useDraftsData'
import './drafts.css'

type StatusFilter = 'all' | DraftStatus

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
  const { data, loading, error, retry } = useDraftsData()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

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

      {loading && (
        <p className="state-message" role="status">Loading drafts…</p>
      )}

      {!loading && error && (
        <section className="state-message state-error" aria-labelledby="draft-error-title">
          <h2 id="draft-error-title">Drafts are unavailable</h2>
          <p>{error}</p>
          <button className="secondary-button" onClick={retry} type="button">Retry</button>
        </section>
      )}

      {!loading && !error && visibleDrafts.length === 0 && (
        <section className="state-message" aria-live="polite">
          <h2>No drafts match</h2>
          <p>Try changing the status filter or search terms.</p>
        </section>
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
                    <span className="draft-title">{draft.title}</span>
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