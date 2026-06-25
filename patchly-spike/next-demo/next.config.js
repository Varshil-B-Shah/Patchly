import { withPatchly } from 'patchly/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

export default withPatchly(nextConfig)
