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
