import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'
import path from 'path'

// Minimal Vite plugin shape — avoids adding `vite` as a dependency just for types.
interface HtmlTagDescriptor {
  tag: string
  attrs?: Record<string, string>
  injectTo?: 'body' | 'head'
}
interface MinimalVitePlugin {
  name: string
  enforce?: 'pre' | 'post'
  configResolved?: (config: { root: string }) => void
  transform?: (code: string, id: string) => { code: string; map: unknown } | null
  transformIndexHtml?: {
    order?: 'pre' | 'post'
    handler: (
      html: string,
      ctx: { server?: unknown },
    ) => string | { html: string; tags: HtmlTagDescriptor[] }
  }
}

export interface PatchlyPluginOptions {
  /** Review link token. If set (or PATCHLY_REVIEW_TOKEN env), the overlay is auto-injected in dev. */
  reviewToken?: string
  /** Patchly web host that serves /patchly-overlay.js, e.g. "https://patchly.app" or "http://localhost:3000". */
  cloudHost?: string
}

export function patchlyPlugin(options: PatchlyPluginOptions = {}): MinimalVitePlugin {
  let projectRoot = process.cwd()

  return {
    name: 'patchly-source-injector',
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root
    },

    // Auto-inject the client review overlay in dev/serve when a review token is
    // configured. ctx.server is undefined during `vite build`, so this never
    // leaks into a production bundle (Phase E adds an opt-in build path).
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.server) return html
        const token = options.reviewToken ?? process.env.PATCHLY_REVIEW_TOKEN
        const host = options.cloudHost ?? process.env.PATCHLY_CLOUD_HOST
        if (!token || !host) return html
        return {
          html,
          tags: [
            {
              tag: 'script',
              attrs: {
                src: `${host.replace(/\/+$/, '')}/patchly-overlay.js`,
                'data-patchly-token': token,
              },
              injectTo: 'body',
            },
          ],
        }
      },
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

            if (
              t.isJSXIdentifier(nodePath.node.name) &&
              nodePath.node.name.name === ''
            )
              return

            const srcValue = `${relativePath}:${loc.start.line}:${loc.start.column}`

            const alreadyHas = nodePath.node.attributes.some(
              (attr) =>
                t.isJSXAttribute(attr) &&
                t.isJSXIdentifier(attr.name) &&
                attr.name.name === 'data-patchly-src',
            )

            if (alreadyHas) return

            const attr = t.jsxAttribute(
              t.jsxIdentifier('data-patchly-src'),
              t.stringLiteral(srcValue),
            )

            nodePath.node.attributes.push(attr)
            modified = true
          },
        })

        if (!modified) return null

        const output = generate.default(
          ast,
          { retainLines: true, sourceMaps: true, sourceFileName: id },
          code,
        )

        return { code: output.code, map: output.map }
      } catch (err) {
        const relativePath = path.relative(projectRoot, id).replace(/\\/g, '/')
        console.warn(
          `[Patchly] Could not instrument ${relativePath}:`,
          err instanceof Error ? err.message : String(err),
        )
        return null
      }
    },
  }
}
