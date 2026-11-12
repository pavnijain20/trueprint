import type { Decision, Draft } from '../types'

function safeFileName(title: string) {
  const cleaned = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return cleaned || 'approved-draft'
}

export function ExportApproved({ draft, decisions }: { draft: Draft; decisions: readonly Decision[] }) {
  if (draft.status !== 'approved') return null

  const approval = [...decisions].reverse().find((decision) => decision.type === 'approved')

  function download() {
    const blob = new Blob([draft.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeFileName(draft.title)}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-labelledby="export-approved-title" className="export-approved">
      <h2 id="export-approved-title">Approved and locked</h2>
      <p>
        This version is approved
        {approval ? ` by ${approval.byName} (${approval.byRole})` : ''} and can no longer be edited.
        The download is the clean text only: no findings, comments or highlights.
      </p>
      <button className="primary-button" onClick={download} type="button">
        Download clean version (.txt)
      </button>
    </section>
  )
}
