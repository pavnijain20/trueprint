import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createDraft } from '../lib/api'
import './new-draft.css'

type Channel = '' | 'Instagram' | 'Website' | 'Email'
type FieldErrors = Partial<Record<'title' | 'channel' | 'content', string>>

export function NewDraftPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [channel, setChannel] = useState<Channel>('')
  const [content, setContent] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  if (!user || user.role !== 'author') {
    return (
      <section aria-labelledby="new-draft-access-title" className="new-draft-page">
        <h1 id="new-draft-access-title">Only authors can create drafts</h1>
        <Link className="text-link" to="/drafts">Back to Drafts</Link>
      </section>
    )
  }
  const authorName = user.name

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: FieldErrors = {}
    if (!title.trim()) errors.title = 'Enter a title.'
    if (!channel) errors.channel = 'Choose a channel.'
    if (!content.trim()) errors.content = 'Enter draft text.'
    setFieldErrors(errors)
    setSubmitError(null)
    if (Object.keys(errors).length > 0) return

    setCreating(true)
    try {
      const createdDraft = await createDraft(`${title.trim()} (${channel})`, content, authorName)
      void navigate(`/drafts/${encodeURIComponent(createdDraft.id)}`)
    } catch (failure) {
      setSubmitError(
        failure instanceof Error
          ? failure.message
          : 'The draft could not be created. Please try again.',
      )
      setCreating(false)
    }
  }

  return (
    <section aria-labelledby="new-draft-title" className="new-draft-page">
      <header className="new-draft-heading">
        <p className="eyebrow">CONTENT WORKSPACE</p>
        <h1 id="new-draft-title">New draft</h1>
        <p>Create a draft to start the review process.</p>
      </header>
      <form className="new-draft-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <div className="new-draft-field">
          <label htmlFor="new-draft-name">Title</label>
          <input
            aria-describedby={fieldErrors.title ? 'new-draft-title-error' : undefined}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-required="true"
            autoComplete="off"
            disabled={creating}
            id="new-draft-name"
            onChange={(event) => {
              setTitle(event.target.value)
              setFieldErrors((current) => ({ ...current, title: undefined }))
            }}
            value={title}
          />
          {fieldErrors.title && <p className="new-draft-field-error" id="new-draft-title-error">{fieldErrors.title}</p>}
        </div>
        <div className="new-draft-field">
          <label htmlFor="new-draft-channel">Channel</label>
          <select
            aria-describedby={fieldErrors.channel ? 'new-draft-channel-error' : undefined}
            aria-invalid={Boolean(fieldErrors.channel)}
            aria-required="true"
            disabled={creating}
            id="new-draft-channel"
            onChange={(event) => {
              setChannel(event.target.value as Channel)
              setFieldErrors((current) => ({ ...current, channel: undefined }))
            }}
            value={channel}
          >
            <option value="">Choose a channel</option>
            <option value="Instagram">Instagram</option>
            <option value="Website">Website</option>
            <option value="Email">Email</option>
          </select>
          {fieldErrors.channel && <p className="new-draft-field-error" id="new-draft-channel-error">{fieldErrors.channel}</p>}
        </div>
        <div className="new-draft-field">
          <label htmlFor="new-draft-content">Draft text</label>
          <textarea
            aria-describedby={fieldErrors.content ? 'new-draft-content-error' : undefined}
            aria-invalid={Boolean(fieldErrors.content)}
            aria-required="true"
            disabled={creating}
            id="new-draft-content"
            onChange={(event) => {
              setContent(event.target.value)
              setFieldErrors((current) => ({ ...current, content: undefined }))
            }}
            rows={10}
            value={content}
          />
          {fieldErrors.content && <p className="new-draft-field-error" id="new-draft-content-error">{fieldErrors.content}</p>}
        </div>
        {submitError && <p className="new-draft-submit-error" role="alert">{submitError}</p>}
        <div className="new-draft-actions">
          <Link className="logout-button" to="/drafts">Cancel</Link>
          <button className="primary-button" disabled={creating} type="submit">
            <span aria-live="polite">{creating ? 'Creating...' : 'Create draft'}</span>
          </button>
        </div>
      </form>
    </section>
  )
}
