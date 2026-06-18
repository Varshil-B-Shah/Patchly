// agent/ast/__tests__/property.test.js
// "Never corrupts a file" invariant test.
// For every fixture × a representative operation set: if the edit succeeds, the
// output must parse as valid JSX/TSX with zero syntax errors. If it fails, the
// error code must be a known string (never undefined / null).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { Project } from 'ts-morph'
import { applyEditOperations } from '../applyEdit.js'
import { readFixture, makeTempProject, FIXTURES_DIR } from './helpers.js'
import { ERROR_CODES } from '../../../shared/protocol.js'
import { clearProjectCache } from '../project.js'

// Every fixture paired with: { relPath, target (for root element), fileExt }
const FIXTURES = [
  {
    name: 'Button.jsx',
    relPath: 'src/Button.jsx',
    target: { line: 3, column: 4, tagName: 'button', textSnippet: 'Click me', identifyingAttrs: { 'data-testid': 'submit-btn' } },
  },
  {
    name: 'HeroSection.jsx',
    relPath: 'src/HeroSection.jsx',
    target: { line: 3, column: 4, tagName: 'section' },
  },
  {
    name: 'NavBar.tsx',
    relPath: 'src/NavBar.tsx',
    target: { line: 8, column: 4, tagName: 'nav' },
  },
  {
    name: 'ItemList.jsx',
    relPath: 'src/ItemList.jsx',
    target: { line: 3, column: 4, tagName: 'ul' },
  },
  {
    name: 'ConditionalCard.jsx',
    relPath: 'src/ConditionalCard.jsx',
    target: { line: 4, column: 4, tagName: 'div' },
  },
  {
    name: 'FragmentWrap.jsx',
    relPath: 'src/FragmentWrap.jsx',
    // First real element inside the fragment.
    target: { line: 4, column: 6, tagName: 'header' },
  },
  {
    name: 'ClsxComponent.jsx',
    relPath: 'src/ClsxComponent.jsx',
    target: { line: 5, column: 4, tagName: 'span' },
  },
  {
    name: 'SelfClosingTags.jsx',
    relPath: 'src/SelfClosingTags.jsx',
    target: { line: 3, column: 4, tagName: 'div' },
  },
  {
    name: 'DeepNested.jsx',
    relPath: 'src/DeepNested.jsx',
    target: { line: 3, column: 4, tagName: 'div' },
  },
  {
    name: 'DuplicateSiblings.jsx',
    relPath: 'src/DuplicateSiblings.jsx',
    target: { line: 3, column: 4, tagName: 'ul' },
  },
  {
    name: 'OddWhitespace.jsx',
    relPath: 'src/OddWhitespace.jsx',
    target: { line: 3, column: 8, tagName: 'section' },
  },
  {
    name: 'GenericComponent.tsx',
    relPath: 'src/GenericComponent.tsx',
    target: { line: 8, column: 4, tagName: 'ul' },
  },
]

// Operations to probe. Some may fail (e.g. DYNAMIC_CLASSNAME) — that's expected.
// The invariant is: ok=true ⟹ no syntax errors; ok=false ⟹ known error code.
function probeOps(relPath, target) {
  return [
    { op: 'setClassName', target: { file: relPath, ...target }, add: ['__prop_test__'] },
    { op: 'setAttribute', target: { file: relPath, ...target }, name: 'data-prop-test', value: '1' },
  ]
}

// Parse text as a tsx file and return its syntactic diagnostics.
function diagnosticsFor(text, ext) {
  const proj = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 2 /* React */, allowJs: true },
  })
  const sf = proj.createSourceFile(`__check__.${ext}`, text)
  return proj.getProgram().getSyntacticDiagnostics(sf)
}

const knownCodes = new Set(Object.values(ERROR_CODES))

for (const fixture of FIXTURES) {
  const ext = fixture.name.endsWith('.tsx') ? 'tsx' : 'jsx'
  for (const op of probeOps(fixture.relPath, fixture.target)) {
    test(`never-corrupts: ${fixture.name} × ${op.op}`, async () => {
      const src = readFixture(fixture.name)
      const root = makeTempProject({ [fixture.relPath]: src })
      clearProjectCache()
      try {
        const result = await applyEditOperations({
          projectRoot: root,
          operations: [op],
        })

        if (result.ok) {
          // Golden rule: output must parse without syntax errors.
          const diags = diagnosticsFor(result.formatted, ext)
          assert.strictEqual(
            diags.length,
            0,
            `Syntax errors after ${op.op} on ${fixture.name}:\n` +
              diags.map((d) => d.getMessageText()).join('\n'),
          )
          // File must not be empty.
          assert.ok(result.formatted.length > 0, 'formatted output must not be empty')
        } else {
          // Failure is fine — but the error code must be a known, typed code.
          assert.ok(
            knownCodes.has(result.code),
            `Unknown error code "${result.code}" from ${op.op} on ${fixture.name}`,
          )
        }
      } finally {
        clearProjectCache()
        fs.rmSync(root, { recursive: true, force: true })
      }
    })
  }
}
