import type { ReactNode } from 'react'

export function LoadingState({
  label,
  layout = 'default',
}: {
  label: string
  layout?: 'default' | 'editor' | 'cards'
}) {
  return (
    <section
      aria-busy="true"
      aria-label={label}
      className={`loading-state loading-state-${layout}`}
      role="status"
    >
      <span aria-hidden="true" className="loading-skeleton loading-title" />
      {layout === 'editor' ? (
        <div aria-hidden="true" className="loading-columns">
          <span className="loading-skeleton loading-block" />
          <span className="loading-skeleton loading-block" />
        </div>
      ) : layout === 'cards' ? (
        <div aria-hidden="true" className="loading-cards">
          <span className="loading-skeleton loading-block" />
          <span className="loading-skeleton loading-block" />
          <span className="loading-skeleton loading-block" />
        </div>
      ) : (
        <span aria-hidden="true" className="loading-skeleton loading-block" />
      )}
      <span className="sr-only">{label}</span>
    </section>
  )
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string
  description: string
  onRetry: () => void
}) {
  return (
    <section aria-label={title} className="state-message state-error" role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="secondary-button" onClick={onRetry} type="button">Retry</button>
    </section>
  )
}

export function EmptyState({
  title,
  description,
  action,
  headingLevel = 'h2',
}: {
  title: string
  description: string
  action?: ReactNode
  headingLevel?: 'h1' | 'h2'
}) {
  return (
    <section aria-label={title} className="state-message" role="status">
      {headingLevel === 'h1' ? <h1>{title}</h1> : <h2>{title}</h2>}
      <p>{description}</p>
      {action}
    </section>
  )
}
