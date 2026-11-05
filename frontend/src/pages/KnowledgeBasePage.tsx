import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { guidelines } from '../data/guidelines'
import type { GuidelineCategory, GuidelineDoc } from '../types'
import './knowledge-base.css'

const categories: { value: 'all' | GuidelineCategory; label: string }[] = [
  { value: 'all', label: 'All categories' },
  { value: 'Voice', label: 'Voice' },
  { value: 'Terminology', label: 'Terminology' },
  { value: 'Legal', label: 'Legal' },
  { value: 'Visual', label: 'Visual' },
]
const EMPTY_GUIDELINES: readonly GuidelineDoc[] = []

function HighlightText({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return <>{text}</>

  const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'ig'))

  return (
    <>
      {parts.map((part, index) => (
        part.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase()
          ? <mark className="knowledge-match" key={`${index}-${part}`}>{part}</mark>
          : part
      ))}
    </>
  )
}

function matchesSearch(document: GuidelineDoc, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true

  return document.title.toLocaleLowerCase().includes(normalizedQuery)
    || document.sections.some((section) => (
      `${section.heading} ${section.body}`.toLocaleLowerCase().includes(normalizedQuery)
    ))
}

export function KnowledgeBasePage() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [category, setCategory] = useState<'all' | GuidelineCategory>('all')
  const [search, setSearch] = useState('')
  const [loadedGuidelines, setLoadedGuidelines] = useState<readonly GuidelineDoc[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [emphasizedSectionId, setEmphasizedSectionId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const timeoutId = window.setTimeout(() => {
      try {
        if (active) {
          setLoadedGuidelines(guidelines)
          setError(null)
        }
      } catch (loadError) {
        if (active) {
          setLoadedGuidelines(null)
          setError(loadError instanceof Error ? loadError.message : 'Guidelines could not be loaded. Please try again.')
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

  const documents = loadedGuidelines ?? EMPTY_GUIDELINES
  const visibleDocuments = useMemo(
    () => documents.filter((document) => (
      (category === 'all' || document.category === category) && matchesSearch(document, search)
    )),
    [category, documents, search],
  )
  const requestedDocumentId = searchParams.get('doc')
  const selectedDocument = documents.find((document) => document.id === requestedDocumentId)
    ?? visibleDocuments[0]

  useEffect(() => {
    if (loading || !location.hash || !selectedDocument) return
    const sectionId = location.hash.slice(1)
    const section = selectedDocument.sections.find((item) => item.id === sectionId)
    if (!section) return

    const frameId = window.requestAnimationFrame(() => {
      setEmphasizedSectionId(section.id)
      document.getElementById(section.id)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      })
    })
    const timeoutId = window.setTimeout(() => setEmphasizedSectionId(null), 3000)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [loading, location.hash, selectedDocument])

  function retry() {
    setLoading(true)
    setAttempt((currentAttempt) => currentAttempt + 1)
  }

  function selectDocument(documentId: string) {
    navigate({ pathname: '/knowledge-base', search: `?doc=${encodeURIComponent(documentId)}`, hash: '' })
  }

  if (loading) return <LoadingState label="Loading brand guidelines" />

  return (
    <div className="knowledge-page">
      <header className="section-heading">
        <div>
          <p className="eyebrow">REFERENCE LIBRARY</p>
          <h1>Knowledge Base</h1>
          <p className="section-description">Approved guidance behind TruePrint’s brand and content decisions.</p>
        </div>
        <span className="draft-total" aria-live="polite">
          {error ? 'Guidelines unavailable' : `${visibleDocuments.length} ${visibleDocuments.length === 1 ? 'document' : 'documents'}`}
        </span>
      </header>

      {error && (
        <ErrorState description={error} onRetry={retry} title="Guidelines are unavailable" />
      )}

      {!error && documents.length === 0 && (
        <EmptyState
          description="Approved reference documents will appear here when they are available."
          title="No guidelines available"
        />
      )}

      {!error && documents.length > 0 && (
        <div className="knowledge-layout">
          <aside aria-label="Guideline documents" className="knowledge-sidebar">
            <form className="knowledge-filters" onSubmit={(event) => event.preventDefault()} role="search">
              <div className="filter-field">
                <label htmlFor="guideline-search">Search guidelines</label>
                <input
                  autoComplete="off"
                  id="guideline-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title or section text"
                  type="search"
                  value={search}
                />
              </div>
              <div className="filter-field">
                <label htmlFor="guideline-category">Category</label>
                <select
                  id="guideline-category"
                  onChange={(event) => setCategory(event.target.value as 'all' | GuidelineCategory)}
                  value={category}
                >
                  {categories.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </form>

            {visibleDocuments.length === 0 ? (
              <EmptyState
                description="Try a different search or category."
                title="No matching guidelines"
              />
            ) : (
              <ul className="knowledge-document-list">
                {visibleDocuments.map((document) => (
                  <li key={document.id}>
                    <button
                      aria-current={selectedDocument?.id === document.id ? 'true' : undefined}
                      className="knowledge-document-button"
                      onClick={() => selectDocument(document.id)}
                      type="button"
                    >
                      <span className="knowledge-document-category">{document.category}</span>
                      <span className="knowledge-document-title">
                        <HighlightText query={search} text={document.title} />
                      </span>
                      <span className="knowledge-document-summary">{document.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <article aria-labelledby="guideline-title" className="knowledge-document">
            {selectedDocument ? (
              <>
                <header className="knowledge-document-heading">
                  <p className="eyebrow">{selectedDocument.category} GUIDANCE</p>
                  <h2 id="guideline-title">
                    <HighlightText query={search} text={selectedDocument.title} />
                  </h2>
                  <p>{selectedDocument.summary}</p>
                  <dl className="guideline-metadata">
                    <div><dt>Version</dt><dd>{selectedDocument.version}</dd></div>
                    <div><dt>Owner</dt><dd>{selectedDocument.owner}</dd></div>
                    <div>
                      <dt>Updated</dt>
                      <dd><time dateTime={selectedDocument.updatedAt}>{new Intl.DateTimeFormat('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }).format(new Date(selectedDocument.updatedAt))}</time></dd>
                    </div>
                  </dl>
                </header>
                <div className="guideline-sections">
                  {selectedDocument.sections.map((section) => (
                    <section
                      aria-labelledby={`${section.id}-heading`}
                      className={`guideline-section${emphasizedSectionId === section.id ? ' is-emphasized' : ''}`}
                      id={section.id}
                      key={section.id}
                      tabIndex={-1}
                    >
                      <h3 id={`${section.id}-heading`}>
                        <HighlightText query={search} text={section.heading} />
                      </h3>
                      <p><HighlightText query={search} text={section.body} /></p>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <section className="knowledge-empty">
                <h2>Select a guideline</h2>
                <p>Choose a document from the list to read its approved sections.</p>
              </section>
            )}
          </article>
        </div>
      )}
      <p className="knowledge-backlink">
        Need to review a finding? <Link to="/drafts">Return to drafts</Link>.
      </p>
    </div>
  )
}
