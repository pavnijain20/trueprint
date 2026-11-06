export type Role = 'author' | 'reviewer' | 'approver' | 'admin'

export interface User {
  id: string
  name: string
  role: Role
}

export interface DemoUser extends User {
  description: string
}

export type DraftStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved'

export interface Draft {
  id: string
  title: string
  author: string
  status: DraftStatus
  updatedAt: string
  content: string
}

export interface Comment {
  id: string
  draftId: string
  findingId?: string
  authorName: string
  authorRole: Role
  text: string
  createdAt: string
}

export interface Decision {
  id: string
  draftId: string
  type: 'approved' | 'changes_requested'
  byName: string
  byRole: Role
  note?: string
  createdAt: string
}

export type FindingSeverity = 'low' | 'medium' | 'high'
export type FindingStatus = 'open' | 'accepted' | 'dismissed'

export interface Finding {
  id: string
  draftId: string
  category: string
  severity: FindingSeverity
  quote: string
  reason: string
  sourceQuote: string
  sourceName: string
  suggestedFix: string
  confidence: number
  isAI: boolean
  status: FindingStatus
  startOffset?: number
  endOffset?: number
}

export type GuidelineCategory = 'Voice' | 'Terminology' | 'Legal' | 'Visual'

export interface GuidelineDoc {
  id: string
  title: string
  category: GuidelineCategory
  summary: string
  version: string
  updatedAt: string
  owner: string
  sections: { id: string; heading: string; body: string }[]
}