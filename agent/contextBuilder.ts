// agent/contextBuilder.ts
// Builds supplementary context for the LLM: direct imports, global CSS, and
// Tailwind design tokens. All reads are capped and safety-guarded — no path
// traversal, no node_modules, nothing outside projectRoot.

import fs from 'fs'
import path from 'path'
import type { ThemeTokens, ThemeColor } from '../shared/protocol.js'

const IMPORT_RE = /^import\s+.*?from\s+['"]([^'"]+)['"]/gm
const MAX_IMPORT_CHARS = 1500
const MAX_GLOBAL_CSS_CHARS = 1500
const MAX_TAILWIND_CHARS = 400
const MAX_IMPORTS = 3

const FORBIDDEN_SEGMENTS = ['node_modules', '.git', 'dist', 'build', '.next', 'out']

/** A single imported file's path (relative) and (capped) contents. */
export interface ImportContext {
  path: string
  content: string
}

export interface ProjectContext {
  imports: ImportContext[]
  callers: ImportContext[]   // files that USE this component (empty for non-components)
  globalCss: string | null
  tailwindTokens: string
}

/** Minimal shape the context builder needs from a resolved source. */
interface SourceLike {
  relativePath: string
  fullContent: string
}

function isSafe(absolutePath: string, projectRoot: string): boolean {
  const resolved = path.resolve(absolutePath)
  const root = path.resolve(projectRoot)
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return false
  const segments = resolved.replace(root, '').split(path.sep)
  return !segments.some((s) => FORBIDDEN_SEGMENTS.includes(s))
}

function tryRead(filePath: string, maxChars: number): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return content.length > maxChars ? content.slice(0, maxChars) + '\n/* ... truncated */' : content
  } catch {
    return null
  }
}

// Parse static import paths from source text, resolve them relative to the
// source file's directory, and return up to MAX_IMPORTS that exist on disk.
function resolveImports(sourceContent: string, sourceAbsolutePath: string, projectRoot: string): string[] {
  const dir = path.dirname(sourceAbsolutePath)
  const results: string[] = []
  let match: RegExpExecArray | null

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
function findGlobalCss(projectRoot: string): string | null {
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

// Find Tailwind config: v3 uses tailwind.config.*, v4 uses @tailwindcss/postcss
// in postcss config or @import "tailwindcss" in a CSS file — no config file at all.
function findTailwindConfig(projectRoot: string): string | null {
  // Tailwind v3: explicit config file
  for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs']) {
    const abs = path.join(projectRoot, name)
    if (fs.existsSync(abs)) return abs
  }

  // Tailwind v4: detected via postcss config referencing @tailwindcss/postcss
  for (const name of ['postcss.config.mjs', 'postcss.config.js', 'postcss.config.cjs']) {
    const abs = path.join(projectRoot, name)
    if (!fs.existsSync(abs)) continue
    const content = tryRead(abs, 1000)
    if (content?.includes('@tailwindcss/postcss')) return abs
  }

  // Tailwind v4: detected via @import "tailwindcss" in a global CSS file
  for (const cssCandidate of ['app/globals.css', 'src/index.css', 'src/App.css', 'styles/globals.css']) {
    const abs = path.join(projectRoot, cssCandidate)
    if (!fs.existsSync(abs)) continue
    const content = tryRead(abs, 500)
    if (content?.includes('@import "tailwindcss"') || content?.includes("@import 'tailwindcss'")) return abs
  }

  return null
}

// Extract custom theme keys from raw Tailwind config text.
// Text-regex only — no require(), no eval. Returns a capped summary string.
export function parseTailwindConfig(configText: string): string {
  const parts: string[] = []

  // Pull top-level key names from theme.extend.colors / theme.colors blocks.
  const colorBlockRe = /colors\s*:\s*\{([^}]+)\}/gs
  const colorKeys: string[] = []
  let m: RegExpExecArray | null
  while ((m = colorBlockRe.exec(configText)) !== null) {
    const inner = m[1]
    const keyRe = /^\s*['"]?(\w[\w-]*)['"]?\s*:/gm
    let km: RegExpExecArray | null
    while ((km = keyRe.exec(inner)) !== null) {
      if (!colorKeys.includes(km[1])) colorKeys.push(km[1])
    }
  }
  if (colorKeys.length > 0) parts.push(`Custom colors: ${colorKeys.join(', ')}`)

  // Pull spacing keys.
  const spacingBlockRe = /spacing\s*:\s*\{([^}]+)\}/gs
  const spacingEntries: string[] = []
  while ((m = spacingBlockRe.exec(configText)) !== null) {
    const inner = m[1]
    const entryRe = /['"]?(\w[\w.-]*)['"]?\s*:\s*['"]([^'"]+)['"]/g
    let em: RegExpExecArray | null
    while ((em = entryRe.exec(inner)) !== null) {
      spacingEntries.push(`${em[1]}: '${em[2]}'`)
    }
  }
  if (spacingEntries.length > 0) parts.push(`Custom spacing: ${spacingEntries.join(', ')}`)

  const summary = parts.join(' | ')
  return summary.length > MAX_TAILWIND_CHARS ? summary.slice(0, MAX_TAILWIND_CHARS) + '...' : summary
}

/**
 * Extract structured color tokens for the class panel swatches.
 * Unlike parseTailwindConfig (which returns a string summary for the LLM), this
 * returns {name, value} pairs for every custom color, flattening nested shades.
 *
 * Examples:
 *   brand: { DEFAULT: '#6366f1', light: '#a5b4fc' }
 *   → [{name:'brand', value:'#6366f1'}, {name:'brand-light', value:'#a5b4fc'}]
 *
 *   accent: '#f59e0b'
 *   → [{name:'accent', value:'#f59e0b'}]
 */
export function extractThemeTokens(configText: string): ThemeTokens {
  const colors: ThemeColor[] = []
  const seen = new Set<string>()

  // Match colors: { ... } blocks (handles theme.colors and theme.extend.colors)
  const colorBlockRe = /colors\s*:\s*\{([\s\S]*?)\}/g
  let blockMatch: RegExpExecArray | null
  while ((blockMatch = colorBlockRe.exec(configText)) !== null) {
    const block = blockMatch[1]

    // Flat entry: colorName: '#hexval' or colorName: "hexval"
    const flatRe = /^\s*['"]?(\w[\w-]*)['"]?\s*:\s*['"]([#\w()%.,\s]+)['"]/gm
    let m: RegExpExecArray | null
    while ((m = flatRe.exec(block)) !== null) {
      const name = m[1]
      const value = m[2].trim()
      if (!seen.has(name) && value.startsWith('#')) {
        colors.push({ name, value })
        seen.add(name)
      }
    }

    // Nested entry: colorName: { DEFAULT: '#hex', shade: '#hex', ... }
    const nestedRe = /['"]?(\w[\w-]*)['"]?\s*:\s*\{([^}]+)\}/g
    while ((m = nestedRe.exec(block)) !== null) {
      const prefix = m[1]
      const inner = m[2]
      const shadeRe = /['"]?(\w[\w-]*)['"]?\s*:\s*['"]([^'"]+)['"]/g
      let sm: RegExpExecArray | null
      while ((sm = shadeRe.exec(inner)) !== null) {
        const shade = sm[1]
        const value = sm[2].trim()
        if (!value.startsWith('#')) continue
        const fullName = shade === 'DEFAULT' ? prefix : `${prefix}-${shade}`
        if (!seen.has(fullName)) {
          colors.push({ name: fullName, value })
          seen.add(fullName)
        }
      }
    }
  }

  return { colors }
}

/** Best-effort check: does the project have a tailwind.config.*? Gates Tailwind mode. */
export function isTailwindConfigured(projectRoot: string): boolean {
  return findTailwindConfig(projectRoot) !== null
}

/** Load theme tokens from the project's Tailwind config (or return empty). */
export function loadThemeTokens(projectRoot: string): ThemeTokens {
  const twPath = findTailwindConfig(projectRoot)
  if (!twPath) return { colors: [] }
  const text = tryRead(twPath, 8000)
  if (!text) return { colors: [] }
  return extractThemeTokens(text)
}

const MAX_CALLER_CHARS = 2500
const MAX_CALLERS = 3

/**
 * Find files in the project that import and use the given component.
 * Only runs when the source file is a reusable component (capital-letter filename).
 * Used to give the LLM the call site context so it can edit prop values there
 * instead of hardcoding values inside the component template.
 */
export function findCallerFiles(componentRelPath: string, projectRoot: string): ImportContext[] {
  const componentName = path.basename(componentRelPath).replace(/\.(tsx?|jsx?)$/, '')
  if (!/^[A-Z]/.test(componentName)) return []  // not a component file

  const results: ImportContext[] = []
  const componentAbs = path.resolve(projectRoot, componentRelPath)

  function walk(dir: string): void {
    if (results.length >= MAX_CALLERS) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (results.length >= MAX_CALLERS) break
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (!FORBIDDEN_SEGMENTS.includes(e.name) && isSafe(abs, projectRoot)) walk(abs)
      } else if (/\.(tsx?|jsx?)$/.test(e.name) && abs !== componentAbs) {
        const content = tryRead(abs, MAX_CALLER_CHARS)
        if (!content) continue
        // File uses the component as a JSX tag — both conditions required to avoid
        // false positives from files that just happen to mention the name in comments.
        if (content.includes(`<${componentName}`) && content.includes(componentName)) {
          const rel = path.relative(projectRoot, abs).replace(/\\/g, '/')
          results.push({ path: rel, content })
        }
      }
    }
  }

  walk(projectRoot)
  return results
}

// Read import files + global CSS for the given source file.
export function buildFileContext(sourceResult: SourceLike, projectRoot: string): { imports: ImportContext[]; globalCss: string | null } {
  const sourceAbsPath = path.resolve(projectRoot, sourceResult.relativePath)
  const importPaths = resolveImports(sourceResult.fullContent, sourceAbsPath, projectRoot)

  const imports = importPaths
    .map((absPath): ImportContext | null => {
      const content = tryRead(absPath, MAX_IMPORT_CHARS)
      if (!content) return null
      const rel = path.relative(projectRoot, absPath).replace(/\\/g, '/')
      return { path: rel, content }
    })
    .filter((x): x is ImportContext => x !== null)

  const cssPath = findGlobalCss(projectRoot)
  const globalCss = cssPath ? tryRead(cssPath, MAX_GLOBAL_CSS_CHARS) : null

  return { imports, globalCss }
}

// Full context load: imports + callers + global CSS + tailwind tokens.
export function loadProjectContext(sourceResult: SourceLike, projectRoot: string): ProjectContext {
  const { imports, globalCss } = buildFileContext(sourceResult, projectRoot)
  const callers = findCallerFiles(sourceResult.relativePath, projectRoot)

  const twPath = findTailwindConfig(projectRoot)
  const twText = twPath ? tryRead(twPath, 8000) : null
  const tailwindTokens = twText ? parseTailwindConfig(twText) : ''

  return { imports, callers, globalCss, tailwindTokens }
}
