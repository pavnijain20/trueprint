import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { comments } from '../data/comments'
import { decisions } from '../data/decisions'
import { drafts } from '../data/drafts'
import { findings } from '../data/findings'
import { useAuth } from '../context/AuthContext'
import { getInsights, isLiveApi, type InsightsResponse } from '../lib/api'
import type { DraftStatus, Finding } from '../types'
import './insights.css'

interface InsightData {
  drafts: typeof drafts
  findings: typeof findings
  comments: typeof comments
  decisions: typeof decisions
}

interface BarDatum {
  label: string
  value: number
}

function BarChart({ data, id, title }: { data: readonly BarDatum[]; id: string; title: string }) {
  const [showTable, setShowTable] = useState(false)
  const maximum = Math.max(1, ...data.map((item) => item.value))

  return (
    <section aria-labelledby={`${id}-title`} className="insight-panel">
      <header className="insight-panel-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        <button
          aria-controls={`${id}-visual`}
          aria-expanded={showTable}
          className="table-toggle"
          onClick={() => setShowTable((current) => !current)}
          type="button"
        >
          {showTable ? 'View as chart' : 'View as table'}
        </button>
      </header>
      {showTable ? (
        <div className="insight-table-wrap" id={`${id}-visual`}>
          <table className="insight-table">
            <caption className="sr-only">{title}</caption>
            <thead><tr><th scope="col">Label</th><th scope="col">Count</th></tr></thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={2}>No data available</td></tr>
              ) : data.map((item) => (
                <tr key={item.label}><th scope="row">{item.label}</th><td>{item.value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div aria-label={`${title} bar chart`} className="bar-chart" id={`${id}-visual`} role="img">
          {data.length === 0 ? (
            <p className="chart-empty">No data available.</p>
          ) : data.map((item) => (
            <div className="bar-row" key={item.label}>
              <span className="bar-label">{item.label}</span>
              <span aria-hidden="true" className="bar-track">
                <span className="bar-fill" style={{ width: `${(item.value / maximum) * 100}%` }} />
              </span>
              <strong className="bar-value">{item.value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function countBy<T extends string>(items: readonly Finding[], pick: (finding: Finding) => T): BarDatum[] {
  const counts = new Map<T, number>()
  items.forEach((item) => counts.set(pick(item), (counts.get(pick(item)) ?? 0) + 1))
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((first, second) => second.value - first.value || first.label.localeCompare(second.label))
}

function formatDraftStatus(status: DraftStatus) {
  return status.replace('_', ' ')
}

function verdictPresentation(verdict: InsightsResponse['rules'][number]['verdict']) {
  switch (verdict) {
    case 'likely_unclear':
      return { label: 'Often dismissed - wording may be unclear', className: 'verdict-unclear' }
    case 'often_broken':
      return { label: 'Often accepted - recurring mistake', className: 'verdict-broken' }
    case 'ok':
      return { label: 'OK', className: 'verdict-ok' }
    case 'not_enough_data':
      return { label: 'Not enough data yet', className: 'verdict-insufficient' }
  }
}

function eventCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.length
  return null
}

function sampleLabel(data: InsightsResponse): string {
  const real = eventCount(data.realEvents)
  const sample = eventCount(data.sampleEvents)
  const counts = real !== null && sample !== null
    ? ` (${real} real ${real === 1 ? 'event' : 'events'}, ${sample} sample ${sample === 1 ? 'event' : 'events'})`
    : ''
  return `Includes sample history${counts}. Sample history is shown for context and is not live user activity.`
}

export function InsightsPage() {
  const { user } = useAuth()
  const liveApi = isLiveApi()
  const [data, setData] = useState<InsightData | null>(null)
  const [liveData, setLiveData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    if (liveApi) {
      void getInsights()
        .then((response) => {
          if (active) setLiveData(response)
        })
        .catch((loadError: unknown) => {
          if (active) {
            setLiveData(null)
            setError(loadError instanceof Error ? loadError.message : 'Insights could not be loaded. Please try again.')
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })

      return () => {
        active = false
      }
    }

    const timeoutId = window.setTimeout(() => {
      try {
        if (active) {
          setData({ drafts, findings, comments, decisions })
          setError(null)
        }
      } catch (loadError) {
        if (active) {
          setData(null)
          setError(loadError instanceof Error ? loadError.message : 'Insights could not be loaded. Please try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [attempt, liveApi])

  const openFindings = useMemo(
    () => (data?.findings ?? []).filter((finding) => finding.status === 'open'),
    [data],
  )
  const categoryData = useMemo(() => countBy(openFindings, (finding) => finding.category), [openFindings])
  const severityData = useMemo(
    () => ['high', 'medium', 'low'].map((severity) => ({
      label: `${severity[0]?.toUpperCase()}${severity.slice(1)}`,
      value: openFindings.filter((finding) => finding.severity === severity).length,
    })),
    [openFindings],
  )
  const statusData = useMemo(() => {
    const allDrafts = data?.drafts ?? []
    const statuses: DraftStatus[] = ['draft', 'in_review', 'changes_requested', 'approved']
    return statuses.map((status) => ({
      label: formatDraftStatus(status),
      value: allDrafts.filter((draft) => draft.status === status).length,
    }))
  }, [data])
  const topSources = useMemo(() => {
    const counts = new Map<string, number>()
    ;(data?.findings ?? []).forEach((finding) => {
      counts.set(finding.sourceName, (counts.get(finding.sourceName) ?? 0) + 1)
    })
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((first, second) => second.value - first.value || first.label.localeCompare(second.label))
      .slice(0, 5)
  }, [data])

  if (!user || (user.role !== 'approver' && user.role !== 'admin')) {
    return (
      <section aria-labelledby="insights-access-title" className="insights-access">
        <p className="eyebrow">GOVERNANCE REPORTING</p>
        <h1 id="insights-access-title">Insights</h1>
        <h2>You don’t have access to this page</h2>
        <p>Insights are available to approvers and administrators. You can continue reviewing drafts and their findings.</p>
        <Link className="text-link" to="/drafts">Go to drafts</Link>
      </section>
    )
  }

  if (loading) return <LoadingState label="Loading insights..." layout="cards" />

  function retry() {
    setLoading(true)
    setError(null)
    setAttempt((currentAttempt) => currentAttempt + 1)
  }

  if (error || (liveApi ? !liveData : !data)) {
    return (
      <ErrorState
        description={error ?? 'Insights could not be loaded. Please try again.'}
        onRetry={retry}
        title="Insights are unavailable"
      />
    )
  }

  if (liveApi && liveData) {
    if (liveData.total_findings === 0) {
      return (
        <section className="insights-page" aria-labelledby="insights-title">
          <p className="eyebrow">GOVERNANCE REPORTING</p>
          <h1 id="insights-title">Insights</h1>
          {liveData.isSample && (
            <p className="insights-sample-label">{sampleLabel(liveData)}</p>
          )}
          <p className="insights-empty" role="status">
            No data yet. Accept or dismiss some findings first.
          </p>
        </section>
      )
    }

    const repeatedMistakes = liveData.recurring_categories.map(([label, value]) => ({ label, value }))
    const dismissReasons = (liveData.dismissReasons ?? []).map((item) => {
      if (typeof item === 'string') return { text: item, sample: false }
      const reason = typeof item?.reason === 'string' ? item.reason : ''
      const source = typeof item?.sourceId === 'string' ? item.sourceId : ''
      return { text: source ? `${source}: ${reason}` : reason, sample: item?.sample === true }
    }).filter((item) => item.text.trim() !== '')

    return (
      <div className="insights-page">
        <header className="section-heading">
          <div>
            <p className="eyebrow">GOVERNANCE REPORTING</p>
            <h1 id="insights-title">Insights</h1>
            <p className="section-description">A snapshot of content review and guideline activity.</p>
            {liveData.isSample && (
              <p className="insights-sample-label">{sampleLabel(liveData)}</p>
            )}
          </div>
        </header>

        <section aria-label="Summary metrics" className="insight-summary insight-summary-live">
          <article className="summary-card">
            <h2>Total findings</h2>
            <p>{liveData.total_findings}</p>
          </article>
        </section>

        <div className="insights-chart-grid">
          <BarChart data={repeatedMistakes} id="repeated-mistakes-chart" title="Most repeated mistakes" />
        </div>

        <section aria-labelledby="guideline-clarity-title" className="insight-panel guideline-clarity">
          <h2 id="guideline-clarity-title">Guideline Clarity Score</h2>
          <div aria-label="Guideline clarity scores table" className="insight-table-wrap" tabIndex={0}>
            <table className="insight-table clarity-table">
              <caption className="sr-only">Guideline clarity scores and finding outcomes</caption>
              <thead>
                <tr>
                  <th scope="col">source_id</th>
                  <th scope="col">flagged</th>
                  <th scope="col">dismissed</th>
                  <th scope="col">Clarity score</th>
                  <th scope="col">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {liveData.rules.length === 0 ? (
                  <tr><td colSpan={5}>No guideline data available.</td></tr>
                ) : liveData.rules.map((rule) => (
                  <tr key={rule.source_id}>
                    <th scope="row">{rule.source_id}</th>
                    <td>{rule.flagged}</td>
                    <td>{rule.dismissed}</td>
                    <td>{rule.clarity_score === null ? 'Not enough data' : `${rule.clarity_score}/100`}</td>
                    <td>
                      <span className={`insight-verdict ${verdictPresentation(rule.verdict).className}`}>
                        {verdictPresentation(rule.verdict).label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {dismissReasons.length > 0 && (
          <section aria-labelledby="dismiss-reasons-title" className="insight-panel dismiss-reasons">
            <h2 id="dismiss-reasons-title">Why findings were dismissed</h2>
            <ul>
              {dismissReasons.map((reason, index) => (
                <li key={`${reason.text}-${index}`}>
                  {reason.text}{reason.sample ? ' (sample)' : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="insight-disclaimer">AI findings are suggestions. Humans make the final decisions.</p>
      </div>
    )
  }

  if (!data) {
    return (
      <ErrorState
        description="Insights could not be loaded. Please try again."
        onRetry={retry}
        title="Insights are unavailable"
      />
    )
  }

  if (data.drafts.length === 0 && data.findings.length === 0) {
    return (
      <section className="insights-page" aria-labelledby="insights-title">
        <p className="eyebrow">GOVERNANCE REPORTING</p>
        <h1 id="insights-title">Insights</h1>
        <EmptyState
          description="Draft and finding activity will be summarized here when available."
          title="No insight data yet"
        />
      </section>
    )
  }

  const totalFindings = data.findings.length
  const acceptedCount = data.findings.filter((finding) => finding.status === 'accepted').length
  const dismissedCount = data.findings.filter((finding) => finding.status === 'dismissed').length
  const resolvedCount = acceptedCount + dismissedCount
  const acceptedPercent = resolvedCount === 0 ? 0 : Math.round((acceptedCount / resolvedCount) * 100)
  const dismissedPercent = resolvedCount === 0 ? 0 : 100 - acceptedPercent
  const aiFindings = data.findings.filter((finding) => finding.isAI)
  const averageConfidence = aiFindings.length === 0
    ? 0
    : Math.round((aiFindings.reduce((total, finding) => total + finding.confidence, 0) / aiFindings.length) * 100)
  const highOpenCount = openFindings.filter((finding) => finding.severity === 'high').length

  return (
    <div className="insights-page">
      <header className="section-heading">
        <div>
          <p className="eyebrow">GOVERNANCE REPORTING</p>
          <h1 id="insights-title">Insights</h1>
          <p className="section-description">A snapshot of content review and guideline activity.</p>
        </div>
      </header>

      {!liveApi && (
        <p className="insights-data-source">
          Sample data. Live analytics endpoint ready.
        </p>
      )}

      <section aria-label="Summary metrics" className="insight-summary">
        <article className="summary-card">
          <h2>Total drafts</h2>
          <p>{data.drafts.length}</p>
        </article>
        <article className="summary-card">
          <h2>Open findings</h2>
          <p>{openFindings.length}</p>
        </article>
        <article className="summary-card">
          <h2>High-severity open</h2>
          <p>{highOpenCount}</p>
        </article>
        <article className="summary-card">
          <h2>Average AI confidence</h2>
          <p>{averageConfidence}%</p>
          <span>Across {aiFindings.length} AI findings</span>
        </article>
        <article className="summary-card summary-card-wide">
          <h2>Resolved findings</h2>
          <p>{acceptedPercent}% accepted <span aria-hidden="true">/</span> {dismissedPercent}% dismissed</p>
          <span>{acceptedCount} accepted and {dismissedCount} dismissed of {totalFindings} findings</span>
        </article>
      </section>

      <div className="insights-chart-grid">
        <BarChart data={categoryData} id="category-chart" title="Open findings by category" />
        <BarChart data={severityData} id="severity-chart" title="Open findings by severity" />
        <BarChart data={statusData} id="draft-status-chart" title="Drafts by status" />
        <BarChart data={topSources} id="guideline-source-chart" title="Top guideline sources by findings" />
      </div>

      <section aria-labelledby="review-activity-title" className="review-activity insight-panel">
        <h2 id="review-activity-title">Review activity</h2>
        <p>{data.comments.length} comments and {data.decisions.length} recorded decisions across the workspace.</p>
      </section>

      <p className="insight-disclaimer">AI findings are suggestions. Humans make the final decisions.</p>
    </div>
  )
}
