import type { Comment } from '../types'

export const comments = [
  {
    id: 'spring-comment-1',
    draftId: 'spring-campaign',
    findingId: 'spring-terminology-1',
    authorName: 'Jordan Patel',
    authorRole: 'reviewer',
    text: 'Could we use the approved product name in both paragraphs so the language stays consistent?',
    createdAt: '2026-11-05T15:20:00Z',
  },
  {
    id: 'spring-comment-2',
    draftId: 'spring-campaign',
    authorName: 'Maya Chen',
    authorRole: 'author',
    text: 'I’ll update the phrase and keep the invitation to book a tour less urgent.',
    createdAt: '2026-11-05T16:05:00Z',
  },
  {
    id: 'press-comment-1',
    draftId: 'quarterly-release',
    findingId: 'press-legal-1',
    authorName: 'Jordan Patel',
    authorRole: 'reviewer',
    text: 'Please attach the approved evidence and scope, or remove this quantified claim before approval.',
    createdAt: '2026-11-04T10:15:00Z',
  },
  {
    id: 'email-comment-1',
    draftId: 'customer-email',
    authorName: 'Alex Morgan',
    authorRole: 'approver',
    text: 'The updated guide name reads clearly here. The email is ready to send.',
    createdAt: '2026-11-03T12:25:00Z',
  },
] satisfies readonly Comment[]
