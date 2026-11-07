import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Comment, Finding } from '../types'

function relativeTime(value: string) {
  const elapsedSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (Math.abs(elapsedSeconds) < 60) return formatter.format(elapsedSeconds, 'second')
  const elapsedMinutes = Math.round(elapsedSeconds / 60)
  if (Math.abs(elapsedMinutes) < 60) return formatter.format(elapsedMinutes, 'minute')
  const elapsedHours = Math.round(elapsedMinutes / 60)
  if (Math.abs(elapsedHours) < 24) return formatter.format(elapsedHours, 'hour')
  return formatter.format(Math.round(elapsedHours / 24), 'day')
}

export function CommentsPanel({
  comments,
  findings,
  onPost,
}: {
  comments: readonly Comment[]
  findings: readonly Finding[]
  onPost: (text: string, findingId: string | null) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [findingId, setFindingId] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const threads = new Map<string, Comment[]>()
  comments.forEach((comment) => {
    const key = comment.findingId ?? 'general'
    const thread = threads.get(key) ?? []
    thread.push(comment)
    threads.set(key, thread)
  })

  async function postComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const commentText = text.trim()
    if (!commentText || posting) return
    setPosting(true)
    setError(null)
    try {
      await onPost(commentText, findingId || null)
      setText('')
      setAnnouncement('Comment posted')
    } catch (postFailure) {
      setError(
        postFailure instanceof Error ? postFailure.message : 'The comment could not be posted.',
      )
    } finally {
      setPosting(false)
    }
  }

  return (
    <section aria-labelledby="comments-heading" className="comments-panel">
      <header className="comments-heading">
        <div>
          <p className="eyebrow">DISCUSSION</p>
          <h2 id="comments-heading">Comments <span>({comments.length})</span></h2>
        </div>
      </header>

      {comments.length === 0 ? (
        <p className="comments-empty" role="status">No comments yet</p>
      ) : (
        <div className="comment-threads">
          {[...threads.entries()].map(([threadId, thread]) => {
            const finding = findings.find((item) => item.id === threadId)
            return (
              <section className="comment-thread" key={threadId}>
                <h3>{finding ? `Finding: ${finding.category} — “${finding.quote}”` : 'General discussion'}</h3>
                <ol className="comment-list">
                  {thread.map((comment) => (
                    <li className="comment-item" key={comment.id}>
                      <article>
                        <header className="comment-author">
                          <strong>{comment.authorName}</strong>
                          <span className="role-badge">{comment.authorRole}</span>
                          <time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time>
                        </header>
                        <p>{comment.text}</p>
                      </article>
                    </li>
                  ))}
                </ol>
              </section>
            )
          })}
        </div>
      )}

      <form className="comment-form" onSubmit={(event) => void postComment(event)}>
        <div className="comment-form-field">
          <label htmlFor="comment-finding">Attach to a finding (optional)</label>
          <select
            id="comment-finding"
            onChange={(event) => setFindingId(event.target.value)}
            value={findingId}
          >
            <option value="">General discussion</option>
            {findings.map((finding) => (
              <option key={finding.id} value={finding.id}>{finding.category}: {finding.quote}</option>
            ))}
          </select>
        </div>
        <div className="comment-form-field">
          <label htmlFor="new-comment">Add a comment</label>
          <textarea
            id="new-comment"
            onChange={(event) => setText(event.target.value)}
            rows={3}
            value={text}
          />
        </div>
        <button className="primary-button" disabled={!text.trim() || posting} type="submit">
          {posting ? 'Posting...' : 'Post'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p aria-atomic="true" aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  )
}
