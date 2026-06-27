#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getEditInstruction } from '../llm.js'
import type { PatchlyConfig, ResolvedConfig } from '../config.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(currentDir, '../ast/__fixtures__')
const PROJECT_ROOT = path.join(currentDir, '../..')

function loadConfig(): Partial<PatchlyConfig> {
  const rcPath = path.join(PROJECT_ROOT, '.patchlyrc.json')
  try {
    return JSON.parse(fs.readFileSync(rcPath, 'utf8'))
  } catch {
    return {}
  }
}

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8')
}

// Test cases 

interface EvalCase {
  label: string
  fixtureName: string
  relPath: string
  lineNumber: number
  colNumber: number
  elementHtml: string
  elementClasses: string
  prompt: string
  expectedOp: string
  expectedAdd?: string[]
}

const CASES: EvalCase[] = [
  {
    label: 'Add Tailwind classes to a button',
    fixtureName: 'Button.jsx',
    relPath: 'src/Button.jsx',
    lineNumber: 3,
    colNumber: 4,
    elementHtml: '<button class="px-4 py-2 bg-blue-500 text-white rounded" data-testid="submit-btn">Click me</button>',
    elementClasses: 'px-4 py-2 bg-blue-500 text-white rounded',
    prompt: 'make the button font bold',
    expectedOp: 'setClassName',
    expectedAdd: ['font-bold'],
  },
  {
    label: 'Remove a Tailwind class from a button',
    fixtureName: 'Button.jsx',
    relPath: 'src/Button.jsx',
    lineNumber: 3,
    colNumber: 4,
    elementHtml: '<button class="px-4 py-2 bg-blue-500 text-white rounded" data-testid="submit-btn">Click me</button>',
    elementClasses: 'px-4 py-2 bg-blue-500 text-white rounded',
    prompt: 'remove the rounded corners',
    expectedOp: 'setClassName',
  },
  {
    label: 'Change button text',
    fixtureName: 'Button.jsx',
    relPath: 'src/Button.jsx',
    lineNumber: 3,
    colNumber: 4,
    elementHtml: '<button class="px-4 py-2 bg-blue-500 text-white rounded" data-testid="submit-btn">Click me</button>',
    elementClasses: 'px-4 py-2 bg-blue-500 text-white rounded',
    prompt: 'change the button text to "Submit"',
    expectedOp: 'setText',
  },
  {
    label: 'Update an href attribute',
    fixtureName: 'NavBar.tsx',
    relPath: 'src/NavBar.tsx',
    lineNumber: 9,
    colNumber: 6,
    elementHtml: '<a href="/">Home</a>',
    elementClasses: '',
    prompt: 'change the link destination to /home',
    expectedOp: 'setAttribute',
  },
  {
    label: 'Add an aria-label attribute',
    fixtureName: 'Button.jsx',
    relPath: 'src/Button.jsx',
    lineNumber: 3,
    colNumber: 4,
    elementHtml: '<button class="px-4 py-2 bg-blue-500 text-white rounded" data-testid="submit-btn">Click me</button>',
    elementClasses: 'px-4 py-2 bg-blue-500 text-white rounded',
    prompt: 'add an aria-label "Submit form" to the button',
    expectedOp: 'setAttribute',
  },
  {
    label: 'Wrap a button in a div',
    fixtureName: 'Button.jsx',
    relPath: 'src/Button.jsx',
    lineNumber: 3,
    colNumber: 4,
    elementHtml: '<button class="px-4 py-2 bg-blue-500 text-white rounded" data-testid="submit-btn">Click me</button>',
    elementClasses: 'px-4 py-2 bg-blue-500 text-white rounded',
    prompt: 'wrap this button in a div with class "flex justify-center"',
    expectedOp: 'wrapElement',
  },
]

// Runner

type CaseResult = { pass: true; explanation: string } | { pass: false; reason: string }

async function runCase(config: ResolvedConfig, c: EvalCase): Promise<CaseResult> {
  const fullContent = readFixture(c.fixtureName)
  const sourceResult = {
    relativePath: c.relPath,
    absolutePath: path.join(PROJECT_ROOT, c.relPath),
    lineNumber: c.lineNumber,
    colNumber: c.colNumber,
    fullContent,
  }

  const result = await getEditInstruction({
    sourceResult,
    elementHtml: c.elementHtml,
    elementClasses: c.elementClasses,
    prompt: c.prompt,
    config,
    screenshot_base64: null,
  })

  if (!result.ok) {
    const detail = 'message' in result ? result.message : result.explanation
    return { pass: false, reason: `LLM error: ${result.code} — ${detail}` }
  }

  const firstOp = result.operations?.[0]
  if (!firstOp) {
    return { pass: false, reason: 'No operations returned' }
  }

  if (firstOp.op !== c.expectedOp) {
    return { pass: false, reason: `Expected op "${c.expectedOp}", got "${firstOp.op}"` }
  }

  if (c.expectedAdd) {
    const add = 'add' in firstOp && firstOp.add ? firstOp.add : []
    const missing = c.expectedAdd.filter((cls) => !add.includes(cls))
    if (missing.length > 0) {
      return { pass: false, reason: `Missing expected classes: ${missing.join(', ')} (got add=${JSON.stringify(add)})` }
    }
  }

  return { pass: true, explanation: result.explanation }
}

async function main() {
  const config: ResolvedConfig = { ...loadConfig(), projectRoot: PROJECT_ROOT }

  if (!config.azureEndpoint && !process.env.PATCHLY_AZURE_ENDPOINT) {
    console.error('No Azure credentials found. Add them to .patchlyrc.json or set env vars.')
    process.exit(1)
  }

  console.log(`\nPatchly quality eval — ${CASES.length} cases\n`)
  console.log('─'.repeat(60))

  let passed = 0
  for (const c of CASES) {
    process.stdout.write(`  ${c.label.padEnd(45)} `)
    const r = await runCase(config, c)
    if (r.pass) {
      console.log(`PASS  (${r.explanation})`)
      passed++
    } else {
      console.log(`FAIL  ${r.reason}`)
    }
  }

  console.log('─'.repeat(60))
  console.log(`\n  Result: ${passed}/${CASES.length} passed\n`)
  process.exit(passed === CASES.length ? 0 : 1)
}

main()
