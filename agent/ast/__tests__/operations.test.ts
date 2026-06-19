// agent/ast/__tests__/operations.test.ts
// Golden-file regression tests for all 8 edit operations.
// First run auto-generates goldens in __fixtures__/goldens/; subsequent runs compare.
// To regenerate: UPDATE_GOLDEN=1 npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEditOperations } from '../applyEdit.js'
import { readFixture, withProject, assertGolden } from './helpers.js'
import type { EditTarget } from '../../../shared/operations.js'

// ─── Shared target descriptors (line 1-based, col 0-based, pointing at `<`) ──

const BUTTON: EditTarget = {
  file: 'src/Button.jsx',
  line: 3, column: 4, tagName: 'button',
  textSnippet: 'Click me',
  identifyingAttrs: { 'data-testid': 'submit-btn' },
}
const HERO_SECTION: EditTarget = {
  file: 'src/HeroSection.jsx',
  line: 3, column: 4, tagName: 'section',
}
const HERO_H1: EditTarget = {
  file: 'src/HeroSection.jsx',
  line: 4, column: 6, tagName: 'h1',
  textSnippet: 'Welcome',
}
const ITEM_UL: EditTarget = {
  file: 'src/ItemList.jsx',
  line: 3, column: 4, tagName: 'ul',
}
const IMG: EditTarget = {
  file: 'src/SelfClosingTags.jsx',
  line: 4, column: 6, tagName: 'img',
  identifyingAttrs: { src: '/hero.png' },
}
const DEEP_SPAN: EditTarget = {
  file: 'src/DeepNested.jsx',
  line: 8, column: 14, tagName: 'span',
  identifyingAttrs: { 'data-testid': 'deep-leaf' },
  textSnippet: 'Deep content',
}
const NAVBAR_A: EditTarget = {
  file: 'src/NavBar.tsx',
  line: 9, column: 6, tagName: 'a',
  identifyingAttrs: { href: '/' },
}
const ODD_SECTION: EditTarget = {
  file: 'src/OddWhitespace.jsx',
  line: 3, column: 8, tagName: 'section',
}
const CLSX_SPAN: EditTarget = {
  file: 'src/ClsxComponent.jsx',
  line: 5, column: 4, tagName: 'span',
}

// ─── setClassName ──────────────────────────────────────────────────────────────

test('setClassName: add class to existing className', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setClassName', target: BUTTON, add: ['font-bold'] }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('font-bold'), 'added class present')
    assert.ok(result.formatted.includes('px-4'), 'existing classes preserved')
    assertGolden(assert, 'setClassName_add', result.formatted)
  })
})

test('setClassName: remove class from existing className', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setClassName', target: BUTTON, remove: ['bg-blue-500'] }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(!result.formatted.includes('bg-blue-500'), 'removed class absent')
    assert.ok(result.formatted.includes('px-4'), 'other classes preserved')
    assertGolden(assert, 'setClassName_remove', result.formatted)
  })
})

test('setClassName: dynamic clsx() className → DYNAMIC_CLASSNAME', async () => {
  const src = readFixture('ClsxComponent.jsx')
  await withProject({ 'src/ClsxComponent.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setClassName', target: CLSX_SPAN, add: ['new-class'] }],
    })
    assert.ok(!result.ok)
    assert.strictEqual(result.code, 'DYNAMIC_CLASSNAME')
  })
})

// ─── setAttribute ─────────────────────────────────────────────────────────────

test('setAttribute: add new attribute', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setAttribute', target: BUTTON, name: 'aria-label', value: 'Submit' }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('aria-label="Submit"'), 'attribute added')
    assertGolden(assert, 'setAttribute_add', result.formatted)
  })
})

test('setAttribute: update existing attribute', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setAttribute', target: BUTTON, name: 'data-testid', value: 'new-btn' }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('data-testid="new-btn"'), 'attribute updated')
    assert.ok(!result.formatted.includes('submit-btn'), 'old value gone')
    assertGolden(assert, 'setAttribute_update', result.formatted)
  })
})

test('setAttribute: remove attribute (value=null)', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setAttribute', target: BUTTON, name: 'type', value: null }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(!result.formatted.includes('type="button"'), 'attribute removed')
    assertGolden(assert, 'setAttribute_remove', result.formatted)
  })
})

// ─── setText ──────────────────────────────────────────────────────────────────

test('setText: replace text content', async () => {
  const src = readFixture('HeroSection.jsx')
  await withProject({ 'src/HeroSection.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setText', target: HERO_H1, text: 'Hello World' }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('Hello World'), 'new text present')
    assert.ok(!result.formatted.includes('>Welcome<'), 'old text gone')
    assertGolden(assert, 'setText', result.formatted)
  })
})

test('setText: element with non-text children → MIXED_CHILDREN', async () => {
  const src = readFixture('ItemList.jsx')
  await withProject({ 'src/ItemList.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setText', target: ITEM_UL, text: 'changed' }],
    })
    assert.ok(!result.ok)
    assert.strictEqual(result.code, 'MIXED_CHILDREN')
  })
})

// ─── setInlineStyle ───────────────────────────────────────────────────────────

test('setInlineStyle: create style attribute from scratch', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setInlineStyle', target: BUTTON, styles: { color: 'blue' } }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('style='), 'style attr added')
    assert.ok(result.formatted.includes('color'), 'color property present')
    assertGolden(assert, 'setInlineStyle_create', result.formatted)
  })
})

test('setInlineStyle: merge into existing style object', async () => {
  const src = readFixture('HeroSection.jsx')
  await withProject({ 'src/HeroSection.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setInlineStyle', target: HERO_SECTION, styles: { color: 'blue' } }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('padding'), 'original property preserved')
    assert.ok(result.formatted.includes('color'), 'new property merged')
    assertGolden(assert, 'setInlineStyle_merge', result.formatted)
  })
})

// ─── wrapElement ─────────────────────────────────────────────────────────────

test('wrapElement: wrap target in new element', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'wrapElement', target: BUTTON, wrapperTag: 'div', wrapperClassName: 'wrapper' }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('<div className="wrapper">'), 'wrapper added')
    assert.ok(result.formatted.includes('</div>'), 'wrapper closed')
    assert.ok(result.formatted.includes('<button'), 'original element preserved')
    assertGolden(assert, 'wrapElement', result.formatted)
  })
})

// ─── insertChild ─────────────────────────────────────────────────────────────

test('insertChild: append child to element', async () => {
  const src = readFixture('HeroSection.jsx')
  await withProject({ 'src/HeroSection.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'insertChild', target: HERO_SECTION, jsx: '<span className="new-child">Added</span>', position: 'last' }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('new-child'), 'new child present')
    assert.ok(result.formatted.includes('Welcome'), 'existing content preserved')
    assertGolden(assert, 'insertChild_append', result.formatted)
  })
})

test('insertChild: into self-closing element → UNSUPPORTED_TARGET', async () => {
  const src = readFixture('SelfClosingTags.jsx')
  await withProject({ 'src/SelfClosingTags.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'insertChild', target: IMG, jsx: '<span>x</span>', position: 'last' }],
    })
    assert.ok(!result.ok)
    assert.strictEqual(result.code, 'UNSUPPORTED_TARGET')
  })
})

// ─── replaceElement ───────────────────────────────────────────────────────────

test('replaceElement: replace element with new JSX', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'replaceElement', target: BUTTON, jsx: '<a href="/submit" className="link-btn">Submit</a>' }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('<a '), 'replacement element present')
    assert.ok(result.formatted.includes('link-btn'), 'replacement classes present')
    assert.ok(!result.formatted.includes('<button'), 'original element gone')
    assertGolden(assert, 'replaceElement', result.formatted)
  })
})

test('replaceElement: invalid JSX payload → INVALID_JSX', async () => {
  const src = readFixture('Button.jsx')
  await withProject({ 'src/Button.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'replaceElement', target: BUTTON, jsx: '<div unclosed' }],
    })
    assert.ok(!result.ok)
    assert.strictEqual(result.code, 'INVALID_JSX')
  })
})

// ─── removeElement ────────────────────────────────────────────────────────────

test('removeElement: remove element and its whitespace', async () => {
  const src = readFixture('HeroSection.jsx')
  await withProject({ 'src/HeroSection.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'removeElement', target: HERO_H1 }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(!result.formatted.includes('<h1'), 'h1 removed')
    assert.ok(result.formatted.includes('<section'), 'parent preserved')
    assertGolden(assert, 'removeElement', result.formatted)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

test('nested target: operates on 6-level deep leaf element', async () => {
  const src = readFixture('DeepNested.jsx')
  await withProject({ 'src/DeepNested.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setAttribute', target: DEEP_SPAN, name: 'data-test', value: 'nested' }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('data-test="nested"'), 'attr added to deep span')
    assertGolden(assert, 'nestedTarget', result.formatted)
  })
})

test('tsx: setAttribute on a TypeScript JSX file preserves types', async () => {
  const src = readFixture('NavBar.tsx')
  await withProject({ 'src/NavBar.tsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setAttribute', target: NAVBAR_A, name: 'target', value: '_blank' }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('target="_blank"'), 'attr added')
    assert.ok(result.formatted.includes('interface NavBarProps'), 'TS interface preserved')
    assertGolden(assert, 'tsx_setAttribute', result.formatted)
  })
})

test('odd whitespace: surgical edit produces minimal diff, no whole-file reflow', async () => {
  const src = readFixture('OddWhitespace.jsx')
  await withProject({ 'src/OddWhitespace.jsx': src }, async (root) => {
    const result = await applyEditOperations({
      projectRoot: root,
      operations: [{ op: 'setClassName', target: ODD_SECTION, add: ['extra-class'] }],
    })
    assert.ok(result.ok, `Expected ok, got: ${result.message}`)
    assert.ok(result.formatted.includes('extra-class'), 'class added')
    // The file uses 4-space indent — Prettier would reflow it to 2-space.
    // format.js must detect the file isn't Prettier-clean and skip Prettier.
    assert.ok(result.formatted.includes('    return'), 'original 4-space indent preserved')
    // diff should touch only the className attribute line
    const changedLines = result.diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    assert.ok(changedLines.length <= 2, `diff should change ≤2 lines, changed ${changedLines.length}`)
    assertGolden(assert, 'oddWhitespace', result.formatted)
  })
})
