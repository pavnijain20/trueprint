import { useEffect, useState } from 'react'
import { getReliability } from '../lib/api'
import type { ReliabilityResponse } from '../lib/api'
import './reliability.css'

function readableValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized ?? '-'
  } catch {
    return '-'
  }
}

function percentage(value: number | '-'): string {
  if (value === '-') return value
  const percentValue = value <= 1 ? value * 100 : value
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(percentValue)}%`
}

function differs(expected: unknown, predicted: unknown): boolean {
  return readableValue(expected) !== readableValue(predicted)
}

function ReliabilityRows({
  label,
  rows,
  mismatched,
}: {
  label: string
  rows: ReliabilityResponse['rows']
  mismatched: boolean
}) {
  if (rows.length === 0) return null

  return (
    <tbody>
      <tr className="reliability-group-heading">
        <th colSpan={4} scope="rowgroup">{label}</th>
      </tr>
      {rows.map((row, index) => (
        <tr key={`${row.draft}-${index}`}>
          <th scope="row">
            {mismatched && <span className="reliability-mismatch">Mismatch</span>}
            {row.draft}
          </th>
          <td><pre>{readableValue(row.expected)}</pre></td>
          <td><pre>{readableValue(row.predicted)}</pre></td>
          <td><pre>{readableValue(row.findings)}</pre></td>
        </tr>
      ))}
    </tbody>
  )
}

export function ReliabilityPage() {
  const [results, setResults] = useState<ReliabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    getReliability()
      .then((response) => {
        if (active) {
          setResults(response)
          setError(null)
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setResults(null)
          setError(failure instanceof Error
            ? failure.message
            : 'Reliability results could not be loaded. Please try again.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [attempt])

  function retry() {
    setLoading(true)
    setError(null)
    setAttempt((currentAttempt) => currentAttempt + 1)
  }

  if (loading) {
    return (
      <section aria-busy="true" className="reliability-state" role="status">
        <p aria-live="polite">Loading reliability results...</p>
      </section>
    )
  }

  if (error || !results) {
    return (
      <section aria-labelledby="reliability-error-title" className="reliability-state reliability-error" role="alert">
        <h1 id="reliability-error-title">Reliability results are unavailable</h1>
        <p>{error ?? 'Reliability results could not be loaded. Please try again.'}</p>
        <button className="secondary-button" onClick={retry} type="button">Retry</button>
      </section>
    )
  }

  if (results.rows.length === 0) {
    return (
      <div className="reliability-page">
        <header className="section-heading">
          <div>
            <p className="eyebrow">GOVERNANCE REPORTING</p>
            <h1>Reliability</h1>
          </div>
        </header>
        <p className="reliability-empty" role="status">No test results yet.</p>
        <p className="reliability-note">
          These numbers come from a small, team-made test set. They are measurements, not guarantees.
        </p>
      </div>
    )
  }

  const mismatches = results.rows.filter((row) => differs(row.expected, row.predicted))
  const correct = results.rows.filter((row) => !differs(row.expected, row.predicted))
  const summaryCards = [
    { label: 'Drafts', value: String(results.summary.drafts) },
    { label: 'Precision', value: percentage(results.summary.precision) },
    { label: 'Recall', value: percentage(results.summary.recall) },
    { label: 'Unvalidated citation rate', value: percentage(results.summary.unvalidated_citation_rate) },
    { label: 'Drafts with AI error', value: String(results.summary.drafts_with_ai_error) },
  ]

  return (
    <div className="reliability-page">
      <header className="section-heading">
        <div>
          <p className="eyebrow">GOVERNANCE REPORTING</p>
          <h1>Reliability</h1>
          <p className="section-description">
            A measured comparison of AI findings against the team-made test set.
          </p>
        </div>
      </header>

      <section aria-label="Reliability summary" className="reliability-summary">
        {summaryCards.map((card) => (
          <article className="reliability-card" key={card.label}>
            <h2>{card.label}</h2>
            <p>{card.value}</p>
          </article>
        ))}
      </section>

      <div aria-label="Reliability test results table" className="reliability-table-wrap" tabIndex={0}>
        <table className="reliability-table">
          <caption>Expected and predicted findings for each test draft</caption>
          <thead>
            <tr>
              <th scope="col">Draft</th>
              <th scope="col">Expected</th>
              <th scope="col">Predicted</th>
              <th scope="col">Findings</th>
            </tr>
          </thead>
          <ReliabilityRows label="Wrong or missed" mismatched rows={mismatches} />
          <ReliabilityRows label="Correct" mismatched={false} rows={correct} />
        </table>
      </div>

      <p className="reliability-note">
        These numbers come from a small, team-made test set. They are measurements, not guarantees.
      </p>
    </div>
  )
}
