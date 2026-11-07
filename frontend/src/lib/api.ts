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

function apiBaseUrl() {
  const configuredUrl = import.meta.env?.VITE_API_URL?.trim().replace(/\/+$/, '')
  return configuredUrl || 'https://trueprint-api-iciu.onrender.com'
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

async function request(path: string, init?: RequestInit): Promise<Response> {
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

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await request(path, {
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
  const start = value.start
  const end = value.end
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

async function sendJson(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<void> {
  await request(path, {
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
  await request(`/api/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, by, role }),
  })
}

export async function updateFinding(
  findingId: string,
  draftId: string,
  status: FindingStatus,
  by: string,
  role: string,
  reason?: string,
): Promise<Finding> {
  const response = await request(`/api/findings/${encodeURIComponent(findingId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, by, role, ...(reason === undefined ? {} : { reason }) }),
  })
  return parseBackendFinding(await response.json() as unknown, draftId)
}

export async function submitDraft(draftId: string, by: string, role: string): Promise<Draft> {
  const response = await request(`/api/drafts/${encodeURIComponent(draftId)}/submit`, {
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
