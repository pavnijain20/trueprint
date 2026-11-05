import type { Decision } from '../types'

export const decisions = [
  {
    id: 'decision-email-approved',
    draftId: 'customer-email',
    type: 'approved',
    byName: 'Priya Nair',
    byRole: 'approver',
    note: 'Approved after the resource name and signature were confirmed.',
    createdAt: '2026-11-03T12:40:00Z',
  },
  {
    id: 'decision-press-changes',
    draftId: 'quarterly-release',
    type: 'changes_requested',
    byName: 'Jordan Patel',
    byRole: 'reviewer',
    note: 'Please verify the performance claim and spokesperson attribution.',
    createdAt: '2026-11-04T10:20:00Z',
  },
  {
    id: 'decision-spring-review',
    draftId: 'spring-campaign',
    type: 'changes_requested',
    byName: 'Jordan Patel',
    byRole: 'reviewer',
    note: 'Please align the call to action and product terminology with the guidance.',
    createdAt: '2026-11-05T15:30:00Z',
  },
] satisfies readonly Decision[]
