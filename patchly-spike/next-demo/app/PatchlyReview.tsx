// Local copy of PatchlyReview for the demo app.
// In a real project you'd import { PatchlyReview } from 'patchly/next/review'.
export function PatchlyReview() {
  if (process.env.NODE_ENV === 'production') return null
  const token = process.env.PATCHLY_REVIEW_TOKEN
  const host  = process.env.PATCHLY_CLOUD_HOST
  if (!token || !host) return null
  return (
    <script
      src={`${host.replace(/\/+$/, '')}/patchly-overlay.js`}
      data-patchly-token={token}
      async
    />
  )
}
