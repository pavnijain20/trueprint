import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Comment, Finding, User } from '../types'

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
  draftId,
  initialComments,
  findings,
  user,
}: {
  draftId: string
  initialComments: readonly Comment[]
  findings: readonly Finding[]
  user: User
}) {
  const [comments, setComments] = useState<Comment[]>(() => [...initialComments])
  const [text, setText] = useState('')
  const [findingId, setFindingId] = useState('')
  const [announcement, setAnnouncement] = useState('')

  const threads = new Map<string, Comment[]>()
  comments.forEach((comment) => {
    const key = comment.findingId ?? 'general'
    const thread = threads.get(key) ?? []
    thread.push(comment)
    threads.set(key, thread)
  })

  function postComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const commentText = text.trim()
    if (!commentText) return

    const comment: Comment = {
      id: `comment-${Date.now()}`,
      draftId,
      ...(findingId ? { findingId } : {}),
      authorName: user.name,
      authorRole: user.role,
      text: commentText,
      createdAt: new Date().toISOString(),
    }
    setComments((current) => [...current, comment])
    setText('')
    setAnnouncement('Comment posted')
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

      <form className="comment-form" onSubmit={postComment}>
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
        <button className="primary-button" disabled={!text.trim()} type="submit">Post</button>
      </form>
      <p aria-atomic="true" aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  )
}
