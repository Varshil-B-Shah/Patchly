// agent/ast/__tests__/drift.test.js
// Tests for the drift guard and fingerprint re-resolution in ast/confirm.js.
// All four scenarios: exact hit, soft drift (line shift), hard drift (element gone),
// and ambiguity (two elements share the same fingerprint).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEditOperations } from '../applyEdit.js'
import { readFixture, withProject } from './helpers.js'

// ─── Exact match ──────────────────────────────────────────────────────────────

test('drift: exact line:col hit resolves correctly', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{
        op: 'setClassName',
        target: {
          file: 'src/Button.jsx',
          line: 3, column: 4, tagName: 'button',
          textSnippet: 'Click me',
        },
        add: ['test-hit'],
      }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('test-hit'))
  })
})

// ─── Soft drift: element moved (line shift) ───────────────────────────────────

test('drift: element still exists after 5 blank lines inserted above (fingerprint fallback)', async () => {
  const src = readFixture('Button.jsx')
  // Prepend 5 blank lines — the button now lives at line 8 instead of 3.
  const shifted = '\n\n\n\n\n' + src
  await withProject({ 'src/Button.jsx': shifted }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{
        op: 'setClassName',
        // Still targeting old line 3 — line:col miss, but fingerprint matches uniquely.
        target: {
          file: 'src/Button.jsx',
          line: 3, column: 4, tagName: 'button',
          textSnippet: 'Click me',
          identifyingAttrs: { 'data-testid': 'submit-btn' },
        },
        add: ['drift-found'],
      }],
    })
    assert.ok(result.ok, `fingerprint should recover; got: ${result.code} — ${result.message}`)
    assert.ok(result.formatted.includes('drift-found'), 'operation applied after fingerprint fallback')
  })
})

// ─── Hard drift: element removed ──────────────────────────────────────────────

test('drift: element removed from file → TARGET_DRIFTED', async () => {
  // Build a stripped version of Button.jsx that doesn't have the <button> element.
  const stripped = [
    'export default function Button() {',
    '  return (',
    '    <div>',
    '      Nothing here',
    '    </div>',
    '  )',
    '}',
    '',
  ].join('\n')
  await withProject({ 'src/Button.jsx': stripped }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{
        op: 'setClassName',
        target: {
          file: 'src/Button.jsx',
          line: 3, column: 4, tagName: 'button',
          textSnippet: 'Click me',
          identifyingAttrs: { 'data-testid': 'submit-btn' },
        },
        add: ['gone'],
      }],
    })
    assert.ok(!result.ok)
    assert.strictEqual(result.code, 'TARGET_DRIFTED')
  })
})

// ─── Ambiguity: duplicate fingerprint ────────────────────────────────────────

test('drift: two elements share identical fingerprint → TARGET_DRIFTED', async () => {
  // DuplicateSiblings.jsx has two <li className="menu-item">Home</li>.
  // Targeting a non-existent line forces fingerprint scan, which finds 2 matches.
  const src = readFixture('DuplicateSiblings.jsx')
  await withProject({ 'src/DuplicateSiblings.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{
        op: 'setClassName',
        target: {
          file: 'src/DuplicateSiblings.jsx',
          line: 999,   // intentionally out of range — forces fingerprint scan
          column: 6,
          tagName: 'li',
          textSnippet: 'Home',   // matches BOTH <li>s
        },
        add: ['ambiguous'],
      }],
    })
    assert.ok(!result.ok)
    assert.strictEqual(result.code, 'TARGET_DRIFTED')
  })
})
