/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // mongoose is server-only; keep it external so Next doesn't try to bundle it.
    serverComponentsExternalPackages: ['mongoose'],
  },
}

export default nextConfig
