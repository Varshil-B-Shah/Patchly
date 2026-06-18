// agent/contextBuilder.js
// Builds supplementary context for the LLM: direct imports, global CSS, and
// Tailwind design tokens. All reads are capped and safety-guarded — no path
// traversal, no node_modules, nothing outside projectRoot.

import fs from 'fs'
import path from 'path'

const IMPORT_RE = /^import\s+.*?from\s+['"]([^'"]+)['"]/gm
const MAX_IMPORT_CHARS = 1500
const MAX_GLOBAL_CSS_CHARS = 1500
const MAX_TAILWIND_CHARS = 400
const MAX_IMPORTS = 3

const FORBIDDEN_SEGMENTS = ['node_modules', '.git', 'dist', 'build', '.next', 'out']

function isSafe(absolutePath, projectRoot) {
  const resolved = path.resolve(absolutePath)
  const root = path.resolve(projectRoot)
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return false
  const segments = resolved.replace(root, '').split(path.sep)
  return !segments.some(s => FORBIDDEN_SEGMENTS.includes(s))
}

function tryRead(filePath, maxChars) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return content.length > maxChars ? content.slice(0, maxChars) + '\n/* ... truncated */' : content
  } catch {
    return null
  }
}

// Parse static import paths from source text, resolve them relative to the
// source file's directory, and return up to MAX_IMPORTS that exist on disk.
function resolveImports(sourceContent, sourceAbsolutePath, projectRoot) {
  const dir = path.dirname(sourceAbsolutePath)
  const results = []
  let match

  IMPORT_RE.lastIndex = 0
  while ((match = IMPORT_RE.exec(sourceContent)) !== null) {
    const specifier = match[1]
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue

    // Resolve without an extension first, then try common extensions.
    const base = path.resolve(dir, specifier)
    const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`]

    for (const candidate of candidates) {
      if (!isSafe(candidate, projectRoot)) break
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        results.push(candidate)
        break
      }
    }

    if (results.length >= MAX_IMPORTS) break
  }

  return results
}

// Find the project's global CSS file by probing common locations.
function findGlobalCss(projectRoot) {
  const probes = [
    'src/index.css',
    'src/globals.css',
    'src/App.css',
    'app/globals.css',
    'styles/globals.css',
  ]
  for (const rel of probes) {
    const abs = path.join(projectRoot, rel)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

// Find tailwind.config.js or .ts in the project root.
function findTailwindConfig(projectRoot) {
  for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs']) {
    const abs = path.join(projectRoot, name)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

// Extract custom theme keys from raw Tailwind config text.
// Text-regex only — no require(), no eval. Returns a capped summary string.
export function parseTailwindConfig(configText) {
  const parts = []

  // Pull top-level key names from theme.extend.colors / theme.colors blocks.
  const colorBlockRe = /colors\s*:\s*\{([^}]+)\}/gs
  const colorKeys = []
  let m
  while ((m = colorBlockRe.exec(configText)) !== null) {
    const inner = m[1]
    const keyRe = /^\s*['"]?(\w[\w-]*)['"]?\s*:/gm
    let km
    while ((km = keyRe.exec(inner)) !== null) {
      if (!colorKeys.includes(km[1])) colorKeys.push(km[1])
    }
  }
  if (colorKeys.length > 0) parts.push(`Custom colors: ${colorKeys.join(', ')}`)

  // Pull spacing keys.
  const spacingBlockRe = /spacing\s*:\s*\{([^}]+)\}/gs
  const spacingEntries = []
  while ((m = spacingBlockRe.exec(configText)) !== null) {
    const inner = m[1]
    const entryRe = /['"]?(\w[\w.-]*)['"]?\s*:\s*['"]([^'"]+)['"]/g
    let em
    while ((em = entryRe.exec(inner)) !== null) {
      spacingEntries.push(`${em[1]}: '${em[2]}'`)
    }
  }
  if (spacingEntries.length > 0) parts.push(`Custom spacing: ${spacingEntries.join(', ')}`)

  const summary = parts.join(' | ')
  return summary.length > MAX_TAILWIND_CHARS ? summary.slice(0, MAX_TAILWIND_CHARS) + '...' : summary
}

// Read import files + global CSS for the given source file.
export function buildFileContext(sourceResult, projectRoot) {
  const sourceAbsPath = path.resolve(projectRoot, sourceResult.relativePath)
  const importPaths = resolveImports(sourceResult.fullContent, sourceAbsPath, projectRoot)

  const imports = importPaths.map(absPath => {
    const content = tryRead(absPath, MAX_IMPORT_CHARS)
    if (!content) return null
    const rel = path.relative(projectRoot, absPath).replace(/\\/g, '/')
    return { path: rel, content }
  }).filter(Boolean)

  const cssPath = findGlobalCss(projectRoot)
  const globalCss = cssPath ? tryRead(cssPath, MAX_GLOBAL_CSS_CHARS) : null

  return { imports, globalCss }
}

// Full context load: imports + global CSS + tailwind tokens.
export function loadProjectContext(sourceResult, projectRoot) {
  const { imports, globalCss } = buildFileContext(sourceResult, projectRoot)

  const twPath = findTailwindConfig(projectRoot)
  const twText = twPath ? tryRead(twPath, 8000) : null
  const tailwindTokens = twText ? parseTailwindConfig(twText) : ''

  return { imports, globalCss, tailwindTokens }
}
