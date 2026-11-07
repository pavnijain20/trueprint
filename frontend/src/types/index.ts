export type Role = 'author' | 'reviewer' | 'approver' | 'admin'

export interface User {
  id: string
  name: string
  role: Role
}

export interface DemoUser extends User {
  description: string
}

export type DraftStatus = string

export interface Draft {
  id: string
  title: string
  author: string
  status: DraftStatus
  updatedAt: string
  content: string
}

export interface DraftsResponse {
  value: Draft[]
  Count: number
}

export interface DraftVersion {
  id: string
  draftId: string
  content: string
  note?: string
  createdAt?: string
}

export interface DraftDetail {
  draft: Draft
  findings: Finding[]
  comments: Comment[]
  decisions: Decision[]
  versions: DraftVersion[]
}

export interface ReviewRiskContribution {
  finding: string
  category: string
  severity: FindingSeverity
  points: number
}

export interface ReviewRisk {
  level: string
  score: number
  contributions: ReviewRiskContribution[]
}

export interface ReviewResponse {
  findings: Finding[]
  risk: ReviewRisk
}

export interface Comment {
  id: string
  draftId: string
  findingId?: string
  authorName: string
  authorRole: string
  text: string
  createdAt: string
}

export interface Decision {
  id: string
  draftId: string
  type: string
  byName: string
  byRole: string
  note?: string
  createdAt: string
}

export interface ActivityEvent {
  id: string
  createdAt: string
  actor: string
  role: string
  action: string
  draftId: string
  detail: string
}

export type FindingSeverity = 'low' | 'medium' | 'high'
export type FindingStatus = string

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