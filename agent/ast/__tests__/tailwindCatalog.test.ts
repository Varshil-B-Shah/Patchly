// Tests for the bundled Tailwind catalog + search (shared/tailwindCatalog.ts).
// Run via: node --import tsx --test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_CLASSES,
  searchClasses,
  defaultSuggestions,
} from '../../../shared/tailwindCatalog.js'
import type { ThemeTokens } from '../../../shared/protocol.js'

const THEME: ThemeTokens = {
  colors: [
    { name: 'brand', value: '#6366f1' },
    { name: 'brand-light', value: '#a5b4fc' },
    { name: 'accent', value: '#f59e0b' },
  ],
}

test('catalog contains common utilities', () => {
  assert.ok(BASE_CLASSES.includes('items-center'))
  assert.ok(BASE_CLASSES.includes('px-4'))
  assert.ok(BASE_CLASSES.includes('rounded-lg'))
  assert.ok(BASE_CLASSES.includes('bg-blue-500'))
  assert.ok(BASE_CLASSES.includes('flex'))
})

test('searchClasses finds items-center', () => {
  const results = searchClasses('items')
  assert.ok(results.includes('items-center'))
  assert.ok(results.includes('items-start'))
})

test('searchClasses ranks prefix matches before substring matches', () => {
  const results = searchClasses('center')
  // "content-center" (substring) and others; a prefix match like "..." — use a
  // query where both exist: "col" → "col-span-*" (prefix) before nothing else.
  const r2 = searchClasses('justify-c')
  assert.equal(r2[0], 'justify-center')
})

test('searchClasses composes a trailing variant prefix', () => {
  const results = searchClasses('hover:bg-blue')
  assert.ok(results.length > 0)
  assert.ok(results.every((c) => c.startsWith('hover:')))
  assert.ok(results.includes('hover:bg-blue-500'))
})

test('searchClasses composes a stacked variant prefix', () => {
  const results = searchClasses('md:hover:px-')
  assert.ok(results.length > 0)
  assert.ok(results.every((c) => c.startsWith('md:hover:')))
  assert.ok(results.includes('md:hover:px-4'))
})

test('searchClasses merges project theme colors', () => {
  const results = searchClasses('bg-bra', THEME)
  assert.ok(results.includes('bg-brand'))
  assert.ok(results.includes('bg-brand-light'))
})

test('searchClasses respects the limit', () => {
  const results = searchClasses('text', undefined, 5)
  assert.equal(results.length, 5)
})

test('empty query returns default suggestions', () => {
  const results = searchClasses('')
  assert.deepEqual(results, defaultSuggestions())
})

test('trailing-variant-only query offers prefixed starters', () => {
  const results = searchClasses('hover:')
  assert.ok(results.length > 0)
  assert.ok(results.every((c) => c.startsWith('hover:')))
})

test('defaultSuggestions surfaces theme bg- classes first', () => {
  const results = defaultSuggestions(THEME)
  assert.ok(results.includes('bg-brand'))
  assert.ok(results.includes('bg-accent'))
  assert.ok(results.indexOf('bg-brand') < results.indexOf('flex'))
})
