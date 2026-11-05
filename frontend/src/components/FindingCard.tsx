import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { AIBadge } from './AIBadge'
import type { Finding, FindingStatus } from '../types'
import { guidelines } from '../data/guidelines'

interface FindingCardProps {
  finding: Finding
  selected: boolean
  onSelect: () => void
  onStatusChange: (status: FindingStatus) => void
}

function handleActivationKey(event: KeyboardEvent<HTMLElement>, onSelect: () => void) {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onSelect()
  }
}

export function FindingCard({ finding, selected, onSelect, onStatusChange }: FindingCardProps) {
  const confidencePercent = Math.round(finding.confidence * 100)
  const sourceSection = guidelines
    .flatMap((document) => document.sections.map((section) => ({ document, section })))
    .find(({ section }) => section.body === finding.sourceQuote)

  return (
    <article
      aria-label={`${finding.category}, ${finding.severity} severity. Activate to focus its quoted text.`}
      className={`finding-card${selected ? ' is-selected' : ''}`}
      id={`finding-card-${finding.id}`}
      onClick={onSelect}
      onKeyDown={(event) => handleActivationKey(event, onSelect)}
      role="group"
      tabIndex={0}
    >
      <header className="finding-card-heading">
        <div className="finding-labels">
          <h3>{finding.category}</h3>
          <span className={`severity-badge severity-${finding.severity}`}>{finding.severity} severity</span>
          <span className={`finding-status status-${finding.status}`}>{finding.status.replace('_', ' ')}</span>
        </div>
        <AIBadge isAI={finding.isAI} />
      </header>

      <p className="finding-reason">{finding.reason}</p>

      <blockquote className="source-quote">
        <p>{finding.sourceQuote}</p>
        <cite>
          {sourceSection ? (
            <Link to={`/knowledge-base?doc=${encodeURIComponent(sourceSection.document.id)}#${sourceSection.section.id}`}>
              {finding.sourceName}
            </Link>
          ) : finding.sourceName}
        </cite>
      </blockquote>

      <div className="suggested-fix">
        <span className="detail-label">Suggested fix</span>
        <p>{finding.suggestedFix}</p>
      </div>

      <div className="confidence-block">
        <div className="confidence-label">
          <span>Confidence</span>
          <strong>{confidencePercent}%</strong>
        </div>
        <progress aria-label={`Confidence: ${confidencePercent}%`} max="100" value={confidencePercent}>
          {confidencePercent}%
        </progress>
      </div>

      <div className="finding-actions" aria-label="Finding decision">
        <button
          aria-pressed={finding.status === 'accepted'}
          className="accept-button"
          disabled={finding.status === 'accepted'}
          onClick={(event) => {
            event.stopPropagation()
            onStatusChange('accepted')
          }}
          type="button"
        >
          Accept
        </button>
        <button
          aria-pressed={finding.status === 'dismissed'}
          className="dismiss-button"
          disabled={finding.status === 'dismissed'}
          onClick={(event) => {
            event.stopPropagation()
            onStatusChange('dismissed')
          }}
          type="button"
        >
          Dismiss
        </button>
      </div>
    </article>
  )
}