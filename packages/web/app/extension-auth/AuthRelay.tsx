'use client'
import { useEffect, useState } from 'react'

// Posts the member token to the page; the extension's authBridge content script
// (injected on this origin) picks it up via window.message and stores it.
export function AuthRelay({
  token,
  identity,
}: {
  token: string
  identity: { userId: string; name: string; image?: string }
}) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    window.postMessage({ source: 'patchly-auth', token, identity }, window.location.origin)
    setDone(true)
  }, [token, identity])

  return (
    <p className="text-sm text-gray-500">
      {done ? 'Signed in ✓ — return to the extension. You can close this tab.' : 'Connecting…'}
    </p>
  )
}
