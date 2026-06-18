// agent/ast/__tests__/helpers.js
// Shared test utilities for the AST regression suite. Not a test file.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { clearProjectCache } from '../project.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const FIXTURES_DIR = path.join(__dirname, '../__fixtures__')
export const GOLDENS_DIR = path.join(FIXTURES_DIR, 'goldens')

// Read a fixture file's content.
export function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8')
}

// Write `files` (object of { relPath: content }) into a fresh OS temp dir.
// Returns the temp dir root path.
export function makeTempProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchly-test-'))
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(root, relPath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')
  }
  return root
}

// Run `fn(root)` inside a temp project seeded with `files`. Clears the ts-morph
// cache before and after, and removes the temp dir regardless of outcome.
export async function withProject(files, fn) {
  const root = makeTempProject(files)
  clearProjectCache()
  try {
    await fn(root)
  } finally {
    clearProjectCache()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

// Compare `actual` against a stored golden. When the golden file does not exist
// (or UPDATE_GOLDEN=1 is set), write `actual` as the new golden and pass.
// Returns the golden path so tests can log it on first run.
export function assertGolden(assert, testName, actual) {
  const goldenPath = path.join(GOLDENS_DIR, testName + '.txt')
  if (!fs.existsSync(goldenPath) || process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(GOLDENS_DIR, { recursive: true })
    fs.writeFileSync(goldenPath, actual, 'utf8')
    return // first run always passes; subsequent runs compare
  }
  const expected = fs.readFileSync(goldenPath, 'utf8')
  assert.strictEqual(actual, expected, `Golden mismatch for ${testName}`)
}
