import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  createFact,
  createGuideline,
  listFacts,
  listGuidelines,
} from '../lib/api'
import type { KnowledgeFact, KnowledgeGuideline } from '../lib/api'
import './fact-ledger.css'

type LedgerTab = 'facts' | 'guidelines'

function expiryLabel(expires: string | null): string {
  if (!expires) return 'No expiry'
  const timestamp = Date.parse(`${expires}T00:00:00`)
  return Number.isNaN(timestamp)
    ? expires
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(timestamp)
}

export function FactLedgerPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<LedgerTab>('facts')
  const [facts, setFacts] = useState<KnowledgeFact[]>([])
  const [guidelines, setGuidelines] = useState<KnowledgeGuideline[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [expires, setExpires] = useState('')
  const tabListRef = useRef<HTMLDivElement>(null)
  const isAdmin = user?.role === 'admin'

  const loadEntries = useCallback(
    () => Promise.all([listFacts(), listGuidelines()]),
    [],
  )

  useEffect(() => {
    let active = true
    loadEntries()
      .then(([factEntries, guidelineEntries]) => {
        if (active) {
          setFacts(factEntries)
          setGuidelines(guidelineEntries)
          setLoadError(null)
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setLoadError(failure instanceof Error
            ? failure.message
            : 'The Fact Ledger could not be loaded. Please try again.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadEntries])

  function retryLoading() {
    setLoading(true)
    setLoadError(null)
    loadEntries()
      .then(([factEntries, guidelineEntries]) => {
        setFacts(factEntries)
        setGuidelines(guidelineEntries)
      })
      .catch((failure: unknown) => {
        setLoadError(failure instanceof Error
          ? failure.message
          : 'The Fact Ledger could not be loaded. Please try again.')
      })
      .finally(() => setLoading(false))
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const tabs = [...(tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])]
    const currentIndex = tabs.indexOf(event.currentTarget)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = tabs[nextIndex]
    nextTab?.focus()
    setActiveTab(nextTab?.id === 'fact-ledger-guidelines-tab' ? 'guidelines' : 'facts')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isAdmin || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      if (activeTab === 'facts') {
        await createFact(title.trim(), text.trim(), expires || undefined)
        setTitle('')
        setText('')
        setExpires('')
        const refreshedFacts = await listFacts()
        setFacts(refreshedFacts)
      } else {
        await createGuideline(title.trim(), text.trim(), expires || undefined)
        setTitle('')
        setText('')
        setExpires('')
        const refreshedGuidelines = await listGuidelines()
        setGuidelines(refreshedGuidelines)
      }
    } catch (failure) {
      setSaveError(failure instanceof Error
        ? failure.message
        : 'The entry could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const sortedFacts = [...facts].sort((first, second) => {
    if (first.expired !== second.expired) return first.expired ? -1 : 1
    return first.title.localeCompare(second.title)
  })

  if (loading) {
    return (
      <section aria-busy="true" className="fact-ledger-state" role="status">
        <p aria-live="polite">Loading...</p>
      </section>
    )
  }

  if (loadError) {
    return (
      <section aria-labelledby="fact-ledger-error-title" className="fact-ledger-state fact-ledger-error" role="alert">
        <h1 id="fact-ledger-error-title">Fact Ledger is unavailable</h1>
        <p>{loadError}</p>
        <button className="secondary-button" onClick={retryLoading} type="button">Retry</button>
      </section>
    )
  }

  return (
    <div className="fact-ledger-page">
      <header className="section-heading">
        <div>
          <p className="eyebrow">KNOWLEDGE MANAGEMENT</p>
          <h1>Fact Ledger</h1>
          <p className="section-description">Approved facts and guidelines used to support content review.</p>
        </div>
      </header>

      <div
        aria-label="Fact Ledger sections"
        className="fact-ledger-tabs"
        ref={tabListRef}
        role="tablist"
      >
        <button
          aria-controls="fact-ledger-panel"
          aria-selected={activeTab === 'facts'}
          className="fact-ledger-tab"
          id="fact-ledger-facts-tab"
          onClick={() => setActiveTab('facts')}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={activeTab === 'facts' ? 0 : -1}
          type="button"
        >
          Approved facts
        </button>
        <button
          aria-controls="fact-ledger-panel"
          aria-selected={activeTab === 'guidelines'}
          className="fact-ledger-tab"
          id="fact-ledger-guidelines-tab"
          onClick={() => setActiveTab('guidelines')}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={activeTab === 'guidelines' ? 0 : -1}
          type="button"
        >
          Guidelines
        </button>
      </div>

      <section
        aria-labelledby={activeTab === 'facts' ? 'fact-ledger-facts-tab' : 'fact-ledger-guidelines-tab'}
        className="fact-ledger-panel"
        id="fact-ledger-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {activeTab === 'facts' ? (
          <>
            <h2>Approved facts</h2>
            <p className="fact-ledger-expiry-note">
              Expired facts are not trusted by reviews until an admin updates them.
            </p>
            {facts.length === 0 ? (
              <p className="fact-ledger-empty" role="status">No facts yet.</p>
            ) : (
              <div aria-label="Approved facts table" className="fact-ledger-table-wrap" tabIndex={0}>
                <table className="fact-ledger-table">
                  <caption>Approved facts and their expiry status</caption>
                  <thead>
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">Statement</th>
                      <th scope="col">Expires</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFacts.map((fact) => (
                      <tr key={fact.id}>
                        <th scope="row">{fact.title}</th>
                        <td>{fact.text}</td>
                        <td>{expiryLabel(fact.expires)}</td>
                        <td>
                          <span className={`fact-ledger-status${fact.expired ? ' is-expired' : ''}`}>
                            {fact.expired ? 'Expired' : fact.expires === null ? 'No expiry' : 'Valid'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <h2>Guidelines</h2>
            {guidelines.length === 0 ? (
              <p className="fact-ledger-empty" role="status">No guidelines yet.</p>
            ) : (
              <div aria-label="Guidelines table" className="fact-ledger-table-wrap" tabIndex={0}>
                <table className="fact-ledger-table">
                  <caption>Guidelines and their expiry dates</caption>
                  <thead>
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">Text</th>
                      <th scope="col">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guidelines.map((guideline) => (
                      <tr key={guideline.id}>
                        <th scope="row">{guideline.title}</th>
                        <td>{guideline.text}</td>
                        <td>{expiryLabel(guideline.expires)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {isAdmin && (
        <section aria-labelledby="fact-ledger-form-title" className="fact-ledger-form-section">
          <h2 id="fact-ledger-form-title">{activeTab === 'facts' ? 'Add fact' : 'Add guideline'}</h2>
          <form className="fact-ledger-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="fact-ledger-field">
              <label htmlFor="fact-ledger-title">Title</label>
              <input
                autoComplete="off"
                disabled={saving}
                id="fact-ledger-title"
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            </div>
            <div className="fact-ledger-field">
              <label htmlFor="fact-ledger-text">Text</label>
              <textarea
                disabled={saving}
                id="fact-ledger-text"
                onChange={(event) => setText(event.target.value)}
                required
                rows={4}
                value={text}
              />
            </div>
            <div className="fact-ledger-field">
              <label htmlFor="fact-ledger-expires">Expiry date (optional)</label>
              <input
                disabled={saving}
                id="fact-ledger-expires"
                onChange={(event) => setExpires(event.target.value)}
                type="date"
                value={expires}
              />
            </div>
            {saveError && <p className="fact-ledger-save-error" role="alert">{saveError}</p>}
            <button className="primary-button" disabled={saving} type="submit">
              <span aria-live="polite">{saving ? 'Saving...' : activeTab === 'facts' ? 'Add fact' : 'Add guideline'}</span>
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
