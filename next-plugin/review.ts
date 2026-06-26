// next-plugin/review.ts
// <PatchlyReview /> — the Next.js equivalent of the Vite plugin's transformIndexHtml.
// Drop it once into your root layout's <body>; it renders the client-review overlay
// <script> in development when a review token is configured, and nothing in production.
//
// Usage (app/layout.tsx):
//   import { PatchlyReview } from 'patchly/next/review'
//   ... <body>{children}<PatchlyReview /></body>
//
// Env (in your Next project's .env.local):
//   PATCHLY_REVIEW_TOKEN=<review token from the dashboard>
//   PATCHLY_CLOUD_HOST=http://localhost:3000

import * as React from 'react'

export function PatchlyReview(): React.ReactElement | null {
  if (process.env.NODE_ENV === 'production') return null
  const token = process.env.PATCHLY_REVIEW_TOKEN
  const host = process.env.PATCHLY_CLOUD_HOST
  if (!token || !host) return null

  return React.createElement('script', {
    src: `${host.replace(/\/+$/, '')}/patchly-overlay.js`,
    'data-patchly-token': token,
    async: true,
  })
}

export default PatchlyReview
