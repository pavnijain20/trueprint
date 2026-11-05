import { useState } from 'react'
import type { Finding, FindingStatus } from '../types'
import { FindingCard } from './FindingCard'

type FindingFilter = 'all' | FindingStatus

interface FindingsPanelProps {
  findings: readonly Finding[]
  selectedFindingId: string | null
  onSelectFinding: (findingId: string) => void
  onStatusChange: (findingId: string, status: FindingStatus) => void
}

export function FindingsPanel({
  findings,
  selectedFindingId,
  onSelectFinding,
  onStatusChange,
}: FindingsPanelProps) {
  const [filter, setFilter] = useState<FindingFilter>('all')
  const visibleFindings = filter === 'all'
    ? findings
    : findings.filter((finding) => finding.status === filter)

  return (
    <section className="findings-panel" aria-labelledby="findings-heading">
      <header className="findings-panel-heading">
        <div>
          <p className="eyebrow">REVIEW NOTES</p>
          <h2 id="findings-heading">Findings <span>({findings.length})</span></h2>
        </div>
        <div className="filter-field findings-filter">
          <label htmlFor="finding-status-filter">Show</label>
          <select
            id="finding-status-filter"
            onChange={(event) => setFilter(event.target.value as FindingFilter)}
            value={filter}
          >
            <option value="all">All findings</option>
            <option value="open">Open</option>
            <option value="accepted">Accepted</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </header>

      {visibleFindings.length === 0 ? (
        <p className="findings-empty" role="status">
          {findings.length === 0 ? 'No findings for this draft.' : `No ${filter} findings.`}
        </p>
      ) : (
        <div className="finding-list">
          {visibleFindings.map((finding) => (
            <FindingCard
              finding={finding}
              key={finding.id}
              onSelect={() => onSelectFinding(finding.id)}
              onStatusChange={(status) => onStatusChange(finding.id, status)}
              selected={finding.id === selectedFindingId}
            />
          ))}
        </div>
      )}
    </section>
  )
}