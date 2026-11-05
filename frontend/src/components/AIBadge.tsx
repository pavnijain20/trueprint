export function AIBadge({ isAI }: { isAI: boolean }) {
  if (!isAI) {
    return <span className="origin-badge human-badge">Human reviewer</span>
  }

  return (
    <span
      className="origin-badge ai-badge"
      title="Suggested by AI. A human makes the final decision."
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
        <path d="M8 1.5 9.35 6.1 14 7.5 9.35 8.85 8 13.5 6.65 8.85 2 7.5 6.65 6.1 8 1.5Z" />
        <path d="m12.4 10.1.55 1.8 1.8.55-1.8.55-.55 1.8-.55-1.8-1.8-.55 1.8-.55.55-1.8Z" />
      </svg>
      AI-generated
    </span>
  )
}