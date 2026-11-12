import type {
  Comment,
  ActivityEvent,
  Decision,
  Draft,
  DraftDetail,
  DraftsResponse,
  DraftVersion,
  Finding,
  FindingSeverity,
  FindingStatus,
  ReviewResponse,
  ReviewRisk,
  ReviewRiskContribution,
  User,
} from '../types'

export interface BackendFinding {
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
  status: string
}

export interface InsightsResponse {
  total_findings: number
  recurring_categories: [string, number][]
  by_team: Record<string, Record<string, number>>
  rules: {
    source_id: string
    flagged: number
    dismissed: number
    dismiss_rate: number
    clarity_score: number | null
    verdict: 'not_enough_data' | 'likely_unclear' | 'often_broken' | 'ok'
  }[]
  isSample?: boolean
  realEvents?: unknown
  sampleEvents?: unknown
  dismissReasons?: (string | { sourceId?: unknown; reason?: unknown; sample?: unknown })[]
}

export interface ReliabilityResponse {
  summary: {
    drafts: number
    precision: number
    recall: number
    unvalidated_citation_rate: number
    drafts_with_ai_error: number
  }
  rows: {
    draft: string
    expected: unknown
    predicted: unknown
    findings: unknown
  }[]
}

export interface SelfCorrectAttempt {
  attempt: number
  revised: string
  missingProof: string
  remaining: number
}

export interface SelfCorrectResponse {
  status: 'resolved' | 'needs_human' | 'clean' | 'ai_unavailable'
  original: string
  suggestedDraft: string | null
  attempts: SelfCorrectAttempt[]
  autoApplied: false
}

function apiBaseUrl() {
  const configuredUrl = import.meta.env?.VITE_API_URL?.trim().replace(/\/+$/, '')
  return configuredUrl || 'https://trueprint-api-iciu.onrender.com'
}

export function isLiveApi(): boolean {
  return Boolean(import.meta.env?.VITE_API_URL?.trim())
}

const permanentDraftIds: Readonly<Record<string, string>> = {
  'product-page': 'd_demo6',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class DraftNotFoundError extends Error {
  constructor(draftId: string) {
    super(`Draft "${draftId}" was not found. Return to drafts and open an available draft.`)
    this.name = 'DraftNotFoundError'
  }
}

function requiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new Error(`The API returned an invalid ${context}: "${key}" must be a string.`)
  }
  return value
}

class ApiRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

async function requestResponse(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${apiBaseUrl()}${path}`, init)
  if (!response.ok) {
    const body = await response.text()
    let message = body.trim()
    if (message) {
      try {
        const parsed: unknown = JSON.parse(message)
        if (isRecord(parsed) && typeof parsed.detail === 'string') {
          message = parsed.detail
        }
      } catch (parseFailure) {
        if (!(parseFailure instanceof SyntaxError)) throw parseFailure
      }
    }
    const detail = message ? ` ${message}` : ''
    throw new ApiRequestError(response.status, `API request failed (${response.status}).${detail}`)
  }
  return response
}

export async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 90_000,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const abortFromCaller = () => controller.abort(init?.signal?.reason)

  if (init?.signal?.aborted) {
    abortFromCaller()
  } else {
    init?.signal?.addEventListener('abort', abortFromCaller, { once: true })
  }

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.text()
      let detail = ''
      if (body.trim()) {
        try {
          const parsed: unknown = JSON.parse(body)
          if (isRecord(parsed) && typeof parsed.detail === 'string') {
            detail = parsed.detail
          }
        } catch (parseFailure) {
          if (!(parseFailure instanceof SyntaxError)) throw parseFailure
        }
      }
      throw new ApiRequestError(
        response.status,
        detail || `API request failed (${response.status}).`,
      )
    }
    return await response.json() as T
  } catch (error) {
    if (timedOut) {
      throw new Error('The server took too long to respond. It may be waking up - please try again.', { cause: error })
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    init?.signal?.removeEventListener('abort', abortFromCaller)
  }
}

function parseSelfCorrectResponse(value: unknown): SelfCorrectResponse {
  if (!isRecord(value) || !Array.isArray(value.attempts)) {
    throw new Error('The API returned an invalid self-correction response.')
  }
  const status = value.status
  if (
    status !== 'resolved'
    && status !== 'needs_human'
    && status !== 'clean'
    && status !== 'ai_unavailable'
  ) {
    throw new Error('The API returned an unsupported self-correction status.')
  }
  const original = requiredString(value, 'original', 'self-correction response')
  const suggestedDraft = value.suggestedDraft
  if (suggestedDraft !== null && typeof suggestedDraft !== 'string') {
    throw new Error('The API returned an invalid self-correction response: "suggestedDraft" must be a string or null.')
  }
  if (value.autoApplied !== false) {
    throw new Error('The API returned an invalid self-correction response: suggestions must not be applied automatically.')
  }

  const attempts = value.attempts.map((attemptValue): SelfCorrectAttempt => {
    if (!isRecord(attemptValue)) {
      throw new Error('The API returned an invalid self-correction attempt.')
    }
    const attempt = attemptValue.attempt
    const remaining = attemptValue.remaining
    if (!Number.isInteger(attempt) || typeof attempt !== 'number') {
      throw new Error('The API returned an invalid self-correction attempt number.')
    }
    if (!Number.isInteger(remaining) || typeof remaining !== 'number' || remaining < 0) {
      throw new Error('The API returned an invalid remaining findings count.')
    }
    return {
      attempt,
      revised: requiredString(attemptValue, 'revised', 'self-correction attempt'),
      missingProof: requiredString(attemptValue, 'missingProof', 'self-correction attempt'),
      remaining,
    }
  })

  return {
    status,
    original,
    suggestedDraft,
    attempts,
    autoApplied: false,
  }
}

function mockSelfCorrectDraft(original: string): SelfCorrectResponse {
  const suggestedDraft = original.replace(
    /clinically proven to remove acne in 7 days/gi,
    'Dermatologist-tested for daily skincare',
  )
  return {
    status: 'resolved',
    original,
    suggestedDraft,
    attempts: [
      {
        attempt: 1,
        revised: suggestedDraft,
        missingProof: "No approved source supports 'clinically proven'",
        remaining: 1,
      },
      {
        attempt: 2,
        revised: suggestedDraft,
        missingProof: '',
        remaining: 0,
      },
    ],
    autoApplied: false,
  }
}

export async function selfCorrectDraft(
  draftId: string,
  timeoutMs = 90_000,
  original = '',
): Promise<SelfCorrectResponse> {
  if (import.meta.env?.VITE_MOCK_SELF_CORRECT === 'true') {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 3_000))
    return mockSelfCorrectDraft(original)
  }
  const value = await request<unknown>(
    `/api/drafts/${encodeURIComponent(draftId)}/self-correct`,
    { method: 'POST' },
    timeoutMs,
  )
  return parseSelfCorrectResponse(value)
}

export async function applyDraftSuggestion(
  draftId: string,
  content: string,
  user: Pick<User, 'name' | 'role'>,
): Promise<string> {
  if (import.meta.env?.VITE_MOCK_SELF_CORRECT === 'true') return content
  let value: unknown
  try {
    value = await request<unknown>(`/api/drafts/${encodeURIComponent(draftId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        content,
        by: user.name,
        role: user.role,
        note: 'Applied AI suggestion',
      }),
    })
  } catch (failure) {
    if (failure instanceof ApiRequestError && failure.status === 409) {
      throw new Error('This draft is approved and locked. The suggestion could not be applied.', {
        cause: failure,
      })
    }
    throw failure
  }
  const updatedDraft = parseDraft(value)
  if (updatedDraft.id !== draftId) {
    throw new Error('The API updated a different draft than the one requested.')
  }
  return updatedDraft.content
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await requestResponse(path, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  })
  return response.json() as Promise<unknown>
}

function parseDraft(value: unknown): Draft {
  if (!isRecord(value)) throw new Error('The API returned an invalid draft.')
  return {
    id: requiredString(value, 'id', 'draft'),
    title: requiredString(value, 'title', 'draft'),
    author: requiredString(value, 'author', 'draft'),
    status: requiredString(value, 'status', 'draft'),
    updatedAt: requiredString(value, 'updatedAt', 'draft'),
    content: requiredString(value, 'content', 'draft'),
  }
}

function parseBackendFinding(value: unknown, expectedDraftId: string): Finding {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid finding.')
  }
  const severity = requiredString(value, 'severity', 'finding')
  if (severity !== 'low' && severity !== 'medium' && severity !== 'high') {
    throw new Error(`The API returned an unsupported finding severity: "${severity}".`)
  }
  const start = value.startOffset ?? value.start
  const end = value.endOffset ?? value.end
  const confidence = value.confidence
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('The API returned an invalid finding: "confidence" must be a number between 0 and 1.')
  }
  const draftId = requiredString(value, 'draftId', 'finding')
  if (draftId !== expectedDraftId) {
    throw new Error('The API returned a finding for a different draft.')
  }
  if (typeof value.isAI !== 'boolean') {
    throw new Error('The API returned an invalid finding: "isAI" must be a boolean.')
  }
  return {
    id: requiredString(value, 'id', 'finding'),
    draftId,
    category: requiredString(value, 'category', 'finding'),
    severity,
    quote: requiredString(value, 'quote', 'finding'),
    reason: requiredString(value, 'reason', 'finding'),
    sourceQuote: requiredString(value, 'sourceQuote', 'finding'),
    sourceName: requiredString(value, 'sourceName', 'finding'),
    suggestedFix: requiredString(value, 'suggestedFix', 'finding'),
    confidence,
    isAI: value.isAI,
    status: requiredString(value, 'status', 'finding'),
    ...(typeof start === 'number' ? { startOffset: start } : {}),
    ...(typeof end === 'number' ? { endOffset: end } : {}),
  }
}

function parseRiskContribution(value: unknown): ReviewRiskContribution {
  if (!isRecord(value)) throw new Error('The API returned an invalid risk contribution.')
  const severity = requiredString(value, 'severity', 'risk contribution')
  if (severity !== 'low' && severity !== 'medium' && severity !== 'high') {
    throw new Error(`The API returned an unsupported risk contribution severity: "${severity}".`)
  }
  const points = value.points
  if (typeof points !== 'number' || !Number.isFinite(points)) {
    throw new Error('The API returned an invalid risk contribution: "points" must be a number.')
  }
  return {
    finding: requiredString(value, 'finding', 'risk contribution'),
    category: requiredString(value, 'category', 'risk contribution'),
    severity,
    points,
  }
}

function parseReviewRisk(value: unknown): ReviewRisk {
  if (!isRecord(value) || !Array.isArray(value.contributions)) {
    throw new Error('The API returned an invalid review risk.')
  }
  const score = value.score
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new Error('The API returned an invalid review risk: "score" must be a number.')
  }
  return {
    level: requiredString(value, 'level', 'review risk'),
    score,
    contributions: value.contributions.map(parseRiskContribution),
  }
}

function parseReviewResponse(value: unknown, draftId: string): ReviewResponse {
  if (!isRecord(value) || !Array.isArray(value.findings)) {
    throw new Error('The API returned an invalid review response.')
  }
  if (typeof value.error === 'string' && value.error) {
    throw new Error(value.error)
  }
  if (value.error !== null && value.error !== undefined) {
    throw new Error('The API returned an invalid review response: "error" must be null or a string.')
  }
  return {
    findings: value.findings.map((finding) => parseBackendFinding(finding, draftId)),
    risk: parseReviewRisk(value.risk),
  }
}

function parseComment(value: unknown, draftId: string): Comment {
  if (!isRecord(value)) throw new Error('The API returned an invalid comment.')
  const findingId = value.findingId
  return {
    id: requiredString(value, 'id', 'comment'),
    draftId,
    ...(typeof findingId === 'string' ? { findingId } : {}),
    authorName: requiredString(value, 'authorName', 'comment'),
    authorRole: requiredString(value, 'authorRole', 'comment'),
    text: requiredString(value, 'text', 'comment'),
    createdAt: requiredString(value, 'createdAt', 'comment'),
  }
}

function parseDecision(value: unknown, draftId: string): Decision {
  if (!isRecord(value)) throw new Error('The API returned an invalid decision.')
  const note = value.note
  return {
    id: requiredString(value, 'id', 'decision'),
    draftId,
    type: requiredString(value, 'type', 'decision'),
    byName: requiredString(value, 'byName', 'decision'),
    byRole: requiredString(value, 'byRole', 'decision'),
    ...(typeof note === 'string' && note ? { note } : {}),
    createdAt: requiredString(value, 'createdAt', 'decision'),
  }
}

function parseActivityEvent(value: unknown): ActivityEvent {
  if (!isRecord(value)) throw new Error('The API returned an invalid activity event.')
  return {
    id: requiredString(value, 'id', 'activity event'),
    createdAt: requiredString(value, 'at', 'activity event'),
    actor: requiredString(value, 'actor', 'activity event'),
    role: requiredString(value, 'role', 'activity event'),
    action: requiredString(value, 'action', 'activity event'),
    draftId: requiredString(value, 'draft_id', 'activity event'),
    detail: requiredString(value, 'detail', 'activity event'),
  }
}

function parseVersion(value: unknown, draftId: string): DraftVersion {
  if (!isRecord(value)) throw new Error('The API returned an invalid draft version.')
  const note = value.note
  const createdAt = value.createdAt
  if (createdAt !== undefined && createdAt !== null && typeof createdAt !== 'string') {
    throw new Error('The API returned an invalid draft version: "createdAt" must be a string.')
  }
  const versionDraftId = requiredString(value, 'draftId', 'draft version')
  if (versionDraftId !== draftId) {
    throw new Error('The API returned a draft version for a different draft.')
  }
  return {
    id: requiredString(value, 'id', 'draft version'),
    draftId: versionDraftId,
    content: requiredString(value, 'content', 'draft version'),
    ...(typeof note === 'string' ? { note } : {}),
    ...(typeof createdAt === 'string' ? { createdAt } : {}),
  }
}

function draftSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function getDrafts(signal?: AbortSignal): Promise<DraftsResponse> {
  const response = await getJson('/api/drafts', signal)
  if (Array.isArray(response)) {
    const value = response.map(parseDraft)
    return { value, Count: value.length }
  }
  if (!isRecord(response) || !Array.isArray(response.value)) {
    throw new Error('The API returned an invalid draft list.')
  }
  const count = response.Count
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error('The API returned an invalid draft list.')
  }
  return {
    value: response.value.map(parseDraft),
    Count: count,
  }
}

async function getDraftDetailById(draftId: string, signal?: AbortSignal): Promise<DraftDetail> {
  const value = await getJson(`/api/drafts/${encodeURIComponent(draftId)}`, signal)
  if (!isRecord(value) || !Array.isArray(value.findings) || !Array.isArray(value.comments)
    || !Array.isArray(value.decisions) || !Array.isArray(value.versions)) {
    throw new Error('The API returned an invalid draft detail.')
  }
  const draft = parseDraft(value.draft)
  if (draft.id !== draftId) {
    throw new Error('The API returned a different draft than the one requested.')
  }
  return {
    draft,
    findings: value.findings.map((finding) => parseBackendFinding(finding, draft.id)),
    comments: value.comments.map((comment) => parseComment(comment, draft.id)),
    decisions: value.decisions.map((decision) => parseDecision(decision, draft.id)),
    versions: value.versions.map((version) => parseVersion(version, draft.id)),
  }
}

export async function getDraftDetail(draftId: string, signal?: AbortSignal): Promise<DraftDetail> {
  const permanentDraftId = permanentDraftIds[draftId] ?? draftId
  try {
    return await getDraftDetailById(permanentDraftId, signal)
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error
    if (permanentDraftId === 'd_demo6') throw new DraftNotFoundError(permanentDraftId)

    const drafts = await getDrafts(signal)
    const requestedSlug = draftSlug(draftId)
    const matches = drafts.value.filter((draft) => draftSlug(draft.title) === requestedSlug)
    if (matches.length === 0) {
      throw new DraftNotFoundError(draftId)
    }
    if (matches.length > 1) {
      throw new Error(
        `The draft URL "${draftId}" matches multiple live drafts. Return to the Drafts list and open the intended draft.`,
        { cause: error },
      )
    }
    const match = matches[0]
    if (!match) throw new DraftNotFoundError(draftId)
    return getDraftDetailById(match.id, signal)
  }
}

export async function getActivityFeed(): Promise<ActivityEvent[]> {
  const value = await getJson('/api/audit')
  if (!Array.isArray(value)) {
    throw new Error('The API returned an invalid activity feed.')
  }
  return value.map(parseActivityEvent)
}

export async function getInsights(): Promise<InsightsResponse> {
  try {
    // The summary endpoint separates real activity from sample history.
    return await request<InsightsResponse>('/api/insights/summary')
  } catch (error) {
    // Older deployments only have /api/insights.
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 405)) {
      return request<InsightsResponse>('/api/insights')
    }
    throw error
  }
}

function mockReliabilityResponse(): ReliabilityResponse {
  return {
    summary: {
      drafts: 9,
      precision: 0.82,
      recall: 0.76,
      unvalidated_citation_rate: 0.04,
      drafts_with_ai_error: 1,
    },
    rows: [
      { draft: 'Spring skincare campaign', expected: ['unsupported claim'], predicted: ['unsupported claim'], findings: ['Flagged unsupported efficacy claim'] },
      { draft: 'Customer welcome email', expected: ['approved sign-off'], predicted: ['approved sign-off'], findings: ['Flagged missing approved sign-off'] },
      { draft: 'Product launch page', expected: ['unverified statistic'], predicted: [], findings: [] },
      { draft: 'Summer promotion', expected: ['uncited product claim'], predicted: ['uncited product claim'], findings: ['Flagged uncited product claim'] },
      { draft: 'Support response template', expected: [], predicted: ['tone mismatch'], findings: ['Flagged tone mismatch'] },
      { draft: 'Partner announcement', expected: ['partner name format'], predicted: ['partner name format'], findings: ['Flagged partner name format'] },
      { draft: 'Feature comparison sheet', expected: ['missing citation'], predicted: ['missing citation'], findings: ['Flagged missing citation'] },
      { draft: 'Internal event invite', expected: [], predicted: [], findings: [] },
      { draft: 'Mobile app release note', expected: ['accessibility claim'], predicted: ['accessibility claim'], findings: ['Flagged accessibility claim'] },
    ],
  }
}

function parseReliabilityResponse(value: unknown): ReliabilityResponse {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    throw new Error('The API returned an invalid reliability response.')
  }
  const summary = value.summary
  if (!isRecord(summary)) throw new Error('The API returned an invalid reliability response.')
  const numericMetric = (key:
    | 'drafts'
    | 'precision'
    | 'recall'
    | 'unvalidated_citation_rate'
    | 'drafts_with_ai_error'): number => {
    const metric = summary[key]
    if (typeof metric !== 'number' || !Number.isFinite(metric)) {
      throw new Error(`The API returned an invalid reliability summary: "${key}" must be a number.`)
    }
    return metric
  }
  const rows = value.rows.map((row): ReliabilityResponse['rows'][number] => {
    if (!isRecord(row) || typeof row.draft !== 'string') {
      throw new Error('The API returned an invalid reliability test row.')
    }
    return {
      draft: row.draft,
      expected: row.expected,
      predicted: row.predicted,
      findings: row.findings,
    }
  })
  return {
    summary: {
      drafts: numericMetric('drafts'),
      precision: numericMetric('precision'),
      recall: numericMetric('recall'),
      unvalidated_citation_rate: numericMetric('unvalidated_citation_rate'),
      drafts_with_ai_error: numericMetric('drafts_with_ai_error'),
    },
    rows,
  }
}

export async function getReliability(): Promise<ReliabilityResponse> {
  if (import.meta.env?.VITE_MOCK_RELIABILITY === 'true') {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 850))
    return mockReliabilityResponse()
  }
  if (!isLiveApi()) {
    throw new Error('Reliability results are unavailable because VITE_API_URL is not configured.')
  }
  const value = await request<unknown>('/api/reliability')
  return parseReliabilityResponse(value)
}

async function sendJson(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<void> {
  await requestResponse(path, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ...(signal ? { signal } : {}),
  })
}

export async function reviewDraft(draftId: string): Promise<ReviewResponse> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 60_000)
  const request = requestResponse
  try {
    const response = await request(
      `/api/drafts/${encodeURIComponent(draftId)}/review`,
      { method: 'POST', signal: controller.signal },
    )
    const value: unknown = await response.json()
    return parseReviewResponse(value, draftId)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        'The review request timed out after 60 seconds. Please try again.',
        { cause: error },
      )
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function updateDraftContent(draftId: string, content: string, by: string, role: string): Promise<void> {
  await requestResponse(`/api/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, by, role }),
  })
}

export async function restoreDraftVersion(
  draftId: string,
  versionId: string,
  by: string,
  role: string,
): Promise<Draft> {
  const response = await requestResponse(
    `/api/drafts/${encodeURIComponent(draftId)}/versions/${encodeURIComponent(versionId)}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by, role }),
    },
  )
  const restoredDraft = parseDraft(await response.json() as unknown)
  if (restoredDraft.id !== draftId) {
    throw new Error('The API restored a different draft than the one requested.')
  }
  return restoredDraft
}

export async function updateFinding(
  findingId: string,
  draftId: string,
  status: FindingStatus,
  by: string,
  role: string,
  reason?: string,
): Promise<Finding> {
  const response = await requestResponse(`/api/findings/${encodeURIComponent(findingId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, by, role, ...(reason === undefined ? {} : { reason }) }),
  })
  return parseBackendFinding(await response.json() as unknown, draftId)
}

export async function submitDraft(draftId: string, by: string, role: string): Promise<Draft> {
  const response = await requestResponse(`/api/drafts/${encodeURIComponent(draftId)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ by, role }),
  })
  const submittedDraft = parseDraft(await response.json() as unknown)
  if (submittedDraft.id !== draftId) {
    throw new Error('The API submitted a different draft than the one requested.')
  }
  return submittedDraft
}

export async function decideDraft(
  draftId: string,
  type: string,
  byName: string,
  byRole: string,
  note: string,
): Promise<void> {
  await sendJson(`/api/drafts/${encodeURIComponent(draftId)}/decision`, 'POST', {
    type,
    byName,
    byRole,
    note,
  })
}

export async function addDraftComment(
  draftId: string,
  authorName: string,
  authorRole: string,
  text: string,
  findingId: string | null,
): Promise<void> {
  await sendJson(`/api/drafts/${encodeURIComponent(draftId)}/comments`, 'POST', {
    authorName,
    authorRole,
    text,
    findingId,
  })
}
