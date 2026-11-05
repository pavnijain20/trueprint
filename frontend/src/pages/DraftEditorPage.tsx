import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { KeyboardEvent } from 'react'
import { FindingsPanel } from '../components/FindingsPanel'
import { findings as allFindings } from '../data/findings'
import { drafts } from '../data/drafts'
import type { Finding, FindingStatus } from '../types'
import './drafts.css'

function findQuoteRanges(text: string, findings: readonly Finding[]) {
  return findings
    .map((finding) => ({ finding, start: text.indexOf(finding.quote) }))
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
  return (
    <div className="draft-copy">
      {content.split('\n\n').map((paragraph, paragraphIndex) => {
        const paragraphFindings = findings.filter((finding) => paragraph.includes(finding.quote))
        const ranges = findQuoteRanges(paragraph, paragraphFindings)
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
              onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
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

function DraftEditor({ draftId }: { draftId: string }) {
  const draft = drafts.find((item) => item.id === draftId)
  const [draftFindings, setDraftFindings] = useState<Finding[]>(() =>
    allFindings.filter((finding) => finding.draftId === draftId).map((finding) => ({ ...finding })),
  )
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  if (!draft) {
    return (
      <section className="missing-draft" aria-labelledby="missing-draft-title">
        <p className="eyebrow">DRAFTS</p>
        <h1 id="missing-draft-title">We couldn't find that draft</h1>
        <p>It may have been removed or the link may be incorrect.</p>
        <Link className="text-link" to="/drafts">Back to drafts</Link>
      </section>
    )
  }

  function selectFinding(findingId: string, origin: 'card' | 'highlight') {
    setSelectedFindingId(findingId)
    const targetPrefix = origin === 'card' ? 'draft-highlight' : 'finding-card'
    window.requestAnimationFrame(() => {
      document.getElementById(`${targetPrefix}-${findingId}`)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      })
    })
  }

  function changeFindingStatus(findingId: string, status: FindingStatus) {
    setDraftFindings((currentFindings) => currentFindings.map((finding) => (
      finding.id === findingId ? { ...finding, status } : finding
    )))
    setAnnouncement(status === 'accepted' ? 'Finding accepted' : 'Finding dismissed')
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
          <span className={`status-badge status-${draft.status}`}>{draft.status.replace('_', ' ')}</span>
        </div>
      </header>

      <div className="editor-columns">
        <section className="draft-document" aria-labelledby="draft-content-heading">
          <div className="document-heading">
            <h2 id="draft-content-heading">Draft content</h2>
            <span>{draftFindings.length} findings</span>
          </div>
          <DraftCopy
            content={draft.content}
            findings={draftFindings}
            onSelectFinding={(findingId) => selectFinding(findingId, 'highlight')}
            selectedFindingId={selectedFindingId}
          />
        </section>

        <FindingsPanel
          findings={draftFindings}
          onSelectFinding={(findingId) => selectFinding(findingId, 'card')}
          onStatusChange={changeFindingStatus}
          selectedFindingId={selectedFindingId}
        />
      </div>
      <p aria-atomic="true" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  )
}

export function DraftEditorPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <p className="state-message">Draft not found.</p>
  return <DraftEditor key={id} draftId={id} />
}