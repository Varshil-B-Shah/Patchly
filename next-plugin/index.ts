/* eslint-disable @typescript-eslint/no-explicit-any */
export function withPatchly(nextConfig: Record<string, any> = {}): Record<string, any> {
  return {
    ...nextConfig,

    webpack(config: any, ctx: any) {
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: 'pre',
        use: ['patchly/next/loader'],
      })
      return typeof nextConfig.webpack === 'function' ? nextConfig.webpack(config, ctx) : config
    },

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
