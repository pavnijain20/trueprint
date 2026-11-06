import type { Finding } from '../types'

export interface BackendFinding {
  id: string
  category: string
  flagged_text: string
  start: number
  end: number
  reason: string
  severity: 'low' | 'medium' | 'high'
  confidence: number
  source: {
    type: string
    id: string
    quote: string
  }
  suggested_fix: string
  validated: boolean
  status: 'open'
  origin: string
}

export interface ReviewResponse {
  findings: BackendFinding[]
  risk: {
    level: string
    score: number
    contributions: unknown[]
  }
  error: string | null
}

const sourceNames: Record<string, string> = {
  guide_01: 'Tone and urgency guideline',
  guide_02: 'Claims guideline',
  guide_03: 'Product naming guideline',
  F04: 'Free shipping fact',
}

export async function reviewDraft(text: string): Promise<ReviewResponse> {
  const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '')
  if (!apiUrl) {
    throw new Error('VITE_API_URL is not configured.')
  }

  const response = await fetch(`${apiUrl}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft: text }),
  })

  if (!response.ok) {
    throw new Error(`Review request failed (${response.status}).`)
  }

  return await response.json() as ReviewResponse
}

export function mapBackendFinding(finding: BackendFinding, draftId: string): Finding {
  return {
    id: finding.id,
    draftId,
    category: finding.category,
    severity: finding.severity,
    quote: finding.flagged_text,
    reason: finding.reason,
    sourceQuote: finding.source.quote,
    sourceName: sourceNames[finding.source.id] ?? finding.source.id,
    suggestedFix: finding.suggested_fix,
    confidence: finding.confidence,
    isAI: finding.origin !== 'rule',
    status: finding.status,
    startOffset: finding.start,
    endOffset: finding.end,
  }
}
