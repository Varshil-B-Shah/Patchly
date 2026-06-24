import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'
import path from 'path'

export function patchlyPlugin(options = {}) {
  let projectRoot = process.cwd()

  return {
    name: 'patchly-source-injector',
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root
    },

    // Auto-inject the client review overlay in dev/serve when a review token is
    // configured. ctx.server is undefined during `vite build`, so this never
    // leaks into a production bundle.
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.server) return html
        const token = options.reviewToken ?? process.env.PATCHLY_REVIEW_TOKEN
        const host  = options.cloudHost   ?? process.env.PATCHLY_CLOUD_HOST
        if (!token || !host) return html
        return {
          html,
          tags: [{
            tag: 'script',
            attrs: {
              src: `${host.replace(/\/+$/, '')}/patchly-overlay.js`,
              'data-patchly-token': token,
            },
            injectTo: 'body',
          }],
        }
      },
    },

    transform(code, id) {
      if (process.env.NODE_ENV === 'production') return null
      if (!id.match(/\.(jsx|tsx)$/)) return null
      if (id.includes('node_modules')) return null
      if (!id.includes('/src/') && !id.includes('\\src\\')) return null

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
          const already = node.attributes.some(
            a => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: 'data-patchly-src' })
          )
          if (already) return
          const line = node.loc?.start.line ?? 0
          const col  = node.loc?.start.column ?? 0
          node.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier('data-patchly-src'),
              t.stringLiteral(`${relPath}:${line}:${col}`)
            )
          )
        },
      })

      const result = generate.default(ast, { retainLines: true }, code)
      return { code: result.code, map: result.map }
    },
  }
}
