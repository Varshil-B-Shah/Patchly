import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { patchlyPlugin } from '../patchly-vite-plugin.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      patchlyPlugin({
        reviewToken: env.PATCHLY_REVIEW_TOKEN,
        cloudHost:   env.PATCHLY_CLOUD_HOST,
      }),
      react(),
    ],
    server: {
      allowedHosts: true,
    },
  }
})
