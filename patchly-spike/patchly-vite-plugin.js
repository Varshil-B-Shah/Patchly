import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'
import path from 'path'

export function patchlyPlugin() {
  let projectRoot = process.cwd()

  return {
    name: 'patchly-source-injector',
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root
    },

    transform(code, id) {
      if (process.env.NODE_ENV === 'production') return null
      if (!id.match(/\.(jsx|tsx)$/)) return null
      if (id.includes('node_modules')) return null
      if (!id.includes('/src/') && !id.includes('\\src\\')) return null

      // Relative path from project root, normalized to forward slashes
      const relPath = path.relative(projectRoot, id).replace(/\\/g, '/')

      let ast
      try {
        ast = parse(code, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
        })
      } catch {
        return null
      }

      traverse.default(ast, {
        JSXOpeningElement(nodePath) {
          const { node } = nodePath

          // Skip if already has the attribute (e.g. re-transforms)
          const already = node.attributes.some(
            a => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: 'data-patchly-src' })
          )
          if (already) return

          const line = node.loc?.start.line ?? 0
          const col = node.loc?.start.column ?? 0
          const value = `${relPath}:${line}:${col}`

          const attr = t.jsxAttribute(
            t.jsxIdentifier('data-patchly-src'),
            t.stringLiteral(value)
          )

          node.attributes.push(attr)
        },
      })

      const result = generate.default(ast, { retainLines: true }, code)
      return { code: result.code, map: result.map }
    },
  }
}
