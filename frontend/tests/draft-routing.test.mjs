import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { afterEach, test } from 'node:test'
import { DraftNotFoundError, getDraftDetail } from '../src/lib/api.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function draftDetail(id) {
  return {
    draft: {
      id,
      title: 'Product page: Team planning toolkit',
      author: 'Taylor Brooks',
      status: 'in_review',
      updatedAt: '2026-11-05T08:30:00Z',
      content: 'API-backed Product Page content.',
    },
    findings: [],
    comments: [],
    decisions: [],
    versions: [],
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('the product-page route alias loads permanent draft d_demo6', async () => {
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    return jsonResponse(draftDetail('d_demo6'))
  }

  const result = await getDraftDetail('product-page')

  assert.equal(result.draft.id, 'd_demo6')
  assert.equal(requests.length, 1)
  assert.match(requests[0], /\/api\/drafts\/d_demo6$/)
})

test('the permanent d_demo6 route loads d_demo6 directly', async () => {
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    return jsonResponse(draftDetail('d_demo6'))
  }

  const result = await getDraftDetail('d_demo6')

  assert.equal(result.draft.id, 'd_demo6')
  assert.equal(requests.length, 1)
  assert.match(requests[0], /\/api\/drafts\/d_demo6$/)
})

test('a missing permanent Product Page draft reports not found without substituting content', async () => {
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    return jsonResponse({ detail: 'Draft not found' }, 404)
  }

  await assert.rejects(getDraftDetail('product-page'), DraftNotFoundError)
  assert.equal(requests.length, 1)
  assert.match(requests[0], /\/api\/drafts\/d_demo6$/)
})

test('a missing direct d_demo6 route reports not found', async () => {
  globalThis.fetch = async () => jsonResponse({ detail: 'Draft not found' }, 404)

  await assert.rejects(getDraftDetail('d_demo6'), DraftNotFoundError)
})

test('existing draft IDs continue to load directly', async () => {
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    return jsonResponse({
      ...draftDetail('d_demo1'),
      draft: { ...draftDetail('d_demo1').draft, title: 'Serum launch caption' },
    })
  }

  const result = await getDraftDetail('d_demo1')

  assert.equal(result.draft.id, 'd_demo1')
  assert.equal(result.draft.title, 'Serum launch caption')
  assert.equal(requests.length, 1)
  assert.match(requests[0], /\/api\/drafts\/d_demo1$/)
})

test('existing title-slug routes still resolve against live drafts', async () => {
  const requests = []
  globalThis.fetch = async (url) => {
    const requestUrl = String(url)
    requests.push(requestUrl)
    if (requestUrl.endsWith('/api/drafts/spring-campaign')) {
      return jsonResponse({ detail: 'Draft not found' }, 404)
    }
    if (requestUrl.endsWith('/api/drafts')) {
      return jsonResponse([{
        ...draftDetail('d_demo1').draft,
        title: 'Spring Campaign',
      }])
    }
    return jsonResponse({
      ...draftDetail('d_demo1'),
      draft: { ...draftDetail('d_demo1').draft, title: 'Spring Campaign' },
    })
  }

  const result = await getDraftDetail('spring-campaign')

  assert.equal(result.draft.id, 'd_demo1')
  assert.equal(requests.length, 3)
  assert.match(requests[2], /\/api\/drafts\/d_demo1$/)
})

test('an unknown draft slug reports not found after checking live titles', async () => {
  globalThis.fetch = async (url) => String(url).endsWith('/api/drafts')
    ? jsonResponse([])
    : jsonResponse({ detail: 'Draft not found' }, 404)

  await assert.rejects(getDraftDetail('missing-draft'), DraftNotFoundError)
})

test('static hosting rewrites direct draft URLs to the SPA entry point', async () => {
  const vercelConfigText = await readFile(new URL('../vercel.json', import.meta.url), 'utf8')
  const vercelConfig = JSON.parse(vercelConfigText.replace(/^\uFEFF/, ''))
  const netlifyRedirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8')

  assert.ok(vercelConfig.rewrites.some(
    (rewrite) => rewrite.source === '/(.*)' && rewrite.destination === '/index.html',
  ))
  assert.match(netlifyRedirects, /^\/\* \/index\.html 200$/m)
})

test('a detail response for a different ID is rejected', async () => {
  globalThis.fetch = async () => jsonResponse(draftDetail('d_demo1'))

  await assert.rejects(
    getDraftDetail('d_demo6'),
    /different draft than the one requested/,
  )
})
