import type { Draft, Role } from '../types'

const preferredStatuses: Record<Role, readonly string[]> = {
  author: ['changes_requested', 'draft', 'in_review', 'approved'],
  reviewer: ['in_review', 'changes_requested', 'draft', 'approved'],
  approver: ['in_review', 'changes_requested', 'draft', 'approved'],
  admin: ['in_review', 'changes_requested', 'draft', 'approved'],
}

export function getQuickStartDraftId(drafts: readonly Draft[], role: Role): string | undefined {
  for (const status of preferredStatuses[role]) {
    const draft = drafts.find((candidate) => candidate.status === status)
    if (draft) return draft.id
  }
  return drafts[0]?.id
}
