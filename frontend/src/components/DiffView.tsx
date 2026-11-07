import { decodeHtmlEntities, diffText } from '../lib/diff'

export function DiffView({
  previousContent,
  currentContent,
}: {
  previousContent: string
  currentContent: string
}) {
  const segments = diffText(
    decodeHtmlEntities(previousContent),
    decodeHtmlEntities(currentContent),
  )
  const hasChanges = segments.some((segment) => segment.type !== 'same')

  if (!hasChanges) {
    return <p className="diff-empty" role="status">There are no changes between these versions.</p>
  }

  return (
    <div aria-label="Draft changes" className="diff-copy">
      {segments.map((segment, index) => {
        if (segment.type === 'same') return <span key={index}>{segment.value}</span>
        if (segment.type === 'removed') {
          return (
            <del className="diff-removed" key={index}>
              <span className="diff-change-label">Removed:</span>{segment.value}
            </del>
          )
        }
        return (
          <ins className="diff-added" key={index}>
            <span className="diff-change-label">Added:</span>{segment.value}
          </ins>
        )
      })}
    </div>
  )
}
