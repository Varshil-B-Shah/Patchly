/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // mongoose is server-only; keep it external so Next doesn't try to bundle it.
    serverComponentsExternalPackages: ['mongoose'],
  },
  async headers() {
    // Cross-origin headers for the client overlay script. The overlay is loaded
    // from a different origin (e.g. preview app on :5173) and makes XHR calls back
    // here. Wildcard origin is intentional — linkTokens are the auth layer.
    const cors = [
      { key: 'Access-Control-Allow-Origin',  value: '*' },
      { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-uploadthing-version, x-uploadthing-package' },
      { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
    ]
    return [
      { source: '/patchly-overlay.js',      headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] },
      { source: '/api/overlay/:path*',       headers: cors },
      { source: '/api/comments',             headers: cors },
      { source: '/api/comments/:path*',      headers: cors },
      { source: '/api/uploadthing',          headers: cors },
    ]
  },
}

export default nextConfig
