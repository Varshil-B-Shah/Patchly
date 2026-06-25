// instrument/index.ts
// Node-only shared JSX instrumentation: injects data-patchly-src="file:line:col"
// onto every JSX opening element. Used by BOTH the Vite plugin and the Next.js
// loader so the emitted attribute format is byte-identical across frameworks.

import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'
import path from 'path'

const SKIP_SEGMENTS = ['node_modules', '.next', 'dist', 'build', 'out']

/**
 * Returns instrumented code (+ optional source map), or null to signal "no rewrite"
 * (passthrough) — production builds, non-JSX files, or excluded paths.
 */
export function instrumentJsx(
  code: string,
  filePath: string,
  projectRoot: string,
): { code: string; map?: unknown } | null {
  if (process.env.NODE_ENV === 'production') return null
  if (!/\.(jsx|tsx)$/.test(filePath)) return null

  const normalized = filePath.replace(/\\/g, '/')
  if (SKIP_SEGMENTS.some((seg) => normalized.includes(`/${seg}/`) || normalized.includes(`\\${seg}\\`))) {
    return null
  }

  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    return null
  }

  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/')
  let modified = false

  traverse.default(ast, {
    JSXOpeningElement(nodePath) {
      const { node } = nodePath
      if (!node.loc) return

      const already = node.attributes.some(
        (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: 'data-patchly-src' }),
      )
      if (already) return

      const value = `${relativePath}:${node.loc.start.line}:${node.loc.start.column}`
      node.attributes.push(
        t.jsxAttribute(t.jsxIdentifier('data-patchly-src'), t.stringLiteral(value)),
      )
      modified = true
    },
  })

  if (!modified) return null

  const out = generate.default(ast, { retainLines: true, sourceMaps: true, sourceFileName: filePath }, code)
  return { code: out.code, map: out.map }
}
