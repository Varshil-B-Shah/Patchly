// next-plugin/index.ts
// withPatchly(nextConfig) — wraps a Next.js config to register the Patchly source
// loader in BOTH webpack and Turbopack, so `data-patchly-src` attributes are
// injected regardless of which dev engine `next dev` uses.
//
// Usage (next.config.js / .ts):
//   import { withPatchly } from 'patchly/next'
//   export default withPatchly({ /* your config */ })

/* eslint-disable @typescript-eslint/no-explicit-any */

export function withPatchly(nextConfig: Record<string, any> = {}): Record<string, any> {
  return {
    ...nextConfig,

    // Webpack path (next dev --webpack, or older Next defaults).
    webpack(config: any, ctx: any) {
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: 'pre', // run before next-swc-loader, on the raw source
        use: ['patchly/next/loader'],
      })
      return typeof nextConfig.webpack === 'function' ? nextConfig.webpack(config, ctx) : config
    },

    // Turbopack path (Next 16 default `next dev`).
    turbopack: {
      ...(nextConfig.turbopack ?? {}),
      rules: {
        ...(nextConfig.turbopack?.rules ?? {}),
        '*.{jsx,tsx}': { loaders: ['patchly/next/loader'] },
      },
    },
  }
}

export default withPatchly
