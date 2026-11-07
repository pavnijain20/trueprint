import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getQuickStartDraftId } from '../src/lib/quickStart.ts'

function draft(id, status) {
  return { id, status }
}

test('quick start chooses an existing draft suited to the current role', () => {
  const drafts = [
    draft('random-draft-1', 'draft'),
    draft('random-draft-2', 'in_review'),
    draft('random-draft-3', 'changes_requested'),
  ]

  assert.equal(getQuickStartDraftId(drafts, 'author'), 'random-draft-3')
  assert.equal(getQuickStartDraftId(drafts, 'reviewer'), 'random-draft-2')
  assert.equal(getQuickStartDraftId(drafts, 'approver'), 'random-draft-2')
  assert.equal(getQuickStartDraftId(drafts, 'admin'), 'random-draft-2')
})

test('quick start falls back to another existing draft or no target when empty', () => {
  assert.equal(getQuickStartDraftId([draft('existing-id', 'archived')], 'reviewer'), 'existing-id')
  assert.equal(getQuickStartDraftId([], 'reviewer'), undefined)
})
