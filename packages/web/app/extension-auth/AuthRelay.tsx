'use client'
import { useEffect, useState } from 'react'

// Posts the member token to the page; the extension's authBridge content script
// (injected on this origin) picks it up via window.message and stores it in
// chrome.storage.local. When storage is confirmed written, authBridge posts
// 'patchly-auth-stored' back and we auto-close the tab.
export function AuthRelay({
  token,
  identity,
}: {
  token: string
  identity: { userId: string; name: string; image?: string }
}) {
  const [status, setStatus] = useState<'sending' | 'done' | 'no-ext'>('sending')

  useEffect(() => {
    // Listen for confirmation that authBridge has committed to storage.
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if ((e.data as { source?: string })?.source === 'patchly-auth-stored') {
        setStatus('done')
        // Small delay so the user sees the "Signed in ✓" flash, then close.
        setTimeout(() => window.close(), 800)
      }
    }
    window.addEventListener('message', onMsg)

    // Post the token to authBridge. If the extension isn't installed on this origin,
    // authBridge won't respond and we fall back to the manual "close tab" message.
    window.postMessage({ source: 'patchly-auth', token, identity }, window.location.origin)
    const fallback = setTimeout(() => setStatus('no-ext'), 3000)

    return () => {
      window.removeEventListener('message', onMsg)
      clearTimeout(fallback)
    }
  }, [token, identity])

  if (status === 'sending') return <p className="text-sm text-gray-400">Connecting…</p>
  if (status === 'no-ext') return <p className="text-sm text-red-500">Extension not detected on this page. Make sure the Patchly extension is installed and try again.</p>
  return <p className="text-sm text-green-600 font-medium">Signed in ✓ — closing…</p>
}
