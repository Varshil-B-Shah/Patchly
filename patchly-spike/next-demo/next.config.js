import { withPatchly } from 'patchly/next'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow any *.trycloudflare.com tunnel domain in dev (domain changes every run).
  allowedDevOrigins: ['*.trycloudflare.com'],
  turbopack: {
    root: __dirname,  // silence the workspace-root detection warning
  },
}

export default withPatchly(nextConfig)
