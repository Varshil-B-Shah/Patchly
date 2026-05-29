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
      if (id.includes('patchly')) return null

      try {
        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
        })

        const relativePath = path.relative(projectRoot, id).replace(/\\/g, '/')

        let modified = false

        traverse.default(ast, {
          JSXOpeningElement(nodePath) {
            const { loc } = nodePath.node
            if (!loc) return

            if (t.isJSXIdentifier(nodePath.node.name) &&
                nodePath.node.name.name === '') return

            const srcValue = `${relativePath}:${loc.start.line}:${loc.start.column}`

            const alreadyHas = nodePath.node.attributes.some(
              attr => t.isJSXAttribute(attr) &&
                      t.isJSXIdentifier(attr.name) &&
                      attr.name.name === 'data-patchly-src'
            )

            if (alreadyHas) return

            const attr = t.jsxAttribute(
              t.jsxIdentifier('data-patchly-src'),
              t.stringLiteral(srcValue)
            )

            nodePath.node.attributes.push(attr)
            modified = true
          }
        })

        if (!modified) return null

        const output = generate.default(ast, {
          retainLines: true,
          sourceMaps: true,
          sourceFileName: id,
        }, code)

        return {
          code: output.code,
          map: output.map,
        }

      } catch (err) {
        const relativePath = path.relative(projectRoot, id).replace(/\\/g, '/')
        console.warn(`[Patchly] Could not instrument ${relativePath}:`, err.message)
        return null
      }
    }
  }
}
