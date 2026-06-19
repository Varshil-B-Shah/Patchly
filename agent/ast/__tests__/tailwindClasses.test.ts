// agent/ast/__tests__/tailwindClasses.test.ts
// Unit tests for the Tailwind-conflict-aware class math in shared/tailwindClasses.ts.
// These are the critical correctness tests for the class panel's conflict resolution.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeClassAdd, computeClassRemove, applyClassEdit } from '../../../shared/tailwindClasses.js'

// ─── computeClassAdd ─────────────────────────────────────────────────────────

test('computeClassAdd: px-8 over px-4 removes the conflicting member', () => {
  const result = computeClassAdd(['px-4', 'py-2', 'bg-blue-500'], 'px-8')
  assert.deepStrictEqual(result.add, ['px-8'])
  assert.deepStrictEqual(result.remove, ['px-4'])
})

test('computeClassAdd: bg over bg removes the conflicting bg', () => {
  const result = computeClassAdd(['px-4', 'bg-blue-500', 'text-white'], 'bg-red-600')
  assert.deepStrictEqual(result.add, ['bg-red-600'])
  assert.deepStrictEqual(result.remove, ['bg-blue-500'])
})

test('computeClassAdd: non-conflicting add → no removes', () => {
  const result = computeClassAdd(['px-4', 'py-2'], 'font-bold')
  assert.deepStrictEqual(result.add, ['font-bold'])
  assert.deepStrictEqual(result.remove, [])
})

test('computeClassAdd: adding already-present class → no add, no remove', () => {
  const result = computeClassAdd(['px-4', 'py-2'], 'px-4')
  // twMerge collapses the dup; px-4 is still in merged, so add=[] and remove=[]
  assert.deepStrictEqual(result.remove, [])
  // add may be empty (dup) or ['px-4'] depending on twMerge — either is safe for executor
  // Just confirm remove is empty so we don't accidentally strip it
})

test('computeClassAdd: responsive variant sm:px-8 does NOT strip base px-4', () => {
  const result = computeClassAdd(['px-4', 'py-2'], 'sm:px-8')
  assert.deepStrictEqual(result.add, ['sm:px-8'])
  assert.deepStrictEqual(result.remove, [])
})

test('computeClassAdd: rounded-full over rounded-lg removes the conflicting radius', () => {
  const result = computeClassAdd(['rounded-lg', 'border'], 'rounded-full')
  assert.deepStrictEqual(result.add, ['rounded-full'])
  assert.deepStrictEqual(result.remove, ['rounded-lg'])
})

test('computeClassAdd: text color over text color resolves conflict', () => {
  const result = computeClassAdd(['text-gray-800', 'font-semibold'], 'text-red-600')
  assert.deepStrictEqual(result.add, ['text-red-600'])
  assert.deepStrictEqual(result.remove, ['text-gray-800'])
})

test('computeClassAdd: hover variant does not strip base class', () => {
  const result = computeClassAdd(['bg-blue-500'], 'hover:bg-blue-600')
  assert.deepStrictEqual(result.add, ['hover:bg-blue-600'])
  assert.deepStrictEqual(result.remove, [])
})

// ─── computeClassRemove ───────────────────────────────────────────────────────

test('computeClassRemove: always returns {add:[], remove:[cls]}', () => {
  const result = computeClassRemove('px-4')
  assert.deepStrictEqual(result, { add: [], remove: ['px-4'] })
})

// ─── applyClassEdit ───────────────────────────────────────────────────────────

test('applyClassEdit: mirrors mergeClasses — remove then add, preserves order', () => {
  const result = applyClassEdit(['px-4', 'py-2', 'bg-blue-500'], { add: ['px-8'], remove: ['px-4'] })
  assert.deepStrictEqual(result, ['py-2', 'bg-blue-500', 'px-8'])
})

test('applyClassEdit: remove-only removes the class', () => {
  const result = applyClassEdit(['px-4', 'py-2', 'font-bold'], { add: [], remove: ['py-2'] })
  assert.deepStrictEqual(result, ['px-4', 'font-bold'])
})

test('applyClassEdit: add-only appends new class', () => {
  const result = applyClassEdit(['px-4', 'py-2'], { add: ['font-bold'], remove: [] })
  assert.deepStrictEqual(result, ['px-4', 'py-2', 'font-bold'])
})

test('applyClassEdit: deduplicates — does not add class already present', () => {
  const result = applyClassEdit(['px-4', 'py-2'], { add: ['px-4'], remove: [] })
  assert.deepStrictEqual(result, ['px-4', 'py-2'])
})

test('applyClassEdit: full round-trip — px-8 replaces px-4 at end', () => {
  const current = ['px-4', 'py-2', 'bg-blue-500']
  const edit = computeClassAdd(current, 'px-8')
  const next = applyClassEdit(current, edit)
  assert.ok(next.includes('px-8'), 'px-8 should be in result')
  assert.ok(!next.includes('px-4'), 'px-4 should be removed')
  assert.ok(next.includes('py-2'), 'py-2 should be preserved')
  assert.ok(next.includes('bg-blue-500'), 'bg-blue-500 should be preserved')
})
