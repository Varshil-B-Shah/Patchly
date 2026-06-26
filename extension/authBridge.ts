// extension/authBridge.ts
// Runs on the Patchly web origin only (see manifest content_scripts). When the
// /extension-auth page posts a member token, store it in chrome.storage.local.
// content.ts (on the dev's app pages) watches that key and forwards it to the agent.

interface AuthMessage {
  source: 'patchly-auth'
  token: string
  identity: { userId: string; name: string; image?: string }
}

window.addEventListener('message', (event: MessageEvent) => {
  // Only trust same-origin messages from our own auth page.
  if (event.origin !== window.location.origin) return
  const data = event.data as AuthMessage | undefined
  if (!data || data.source !== 'patchly-auth' || typeof data.token !== 'string') return

  chrome.storage.local.set(
    { patchlyMemberToken: data.token, patchlyIdentity: data.identity },
    () => {
      // Signal back to the page that storage is committed — page uses this to
      // auto-close the tab so the user doesn't have to close it manually.
      window.postMessage({ source: 'patchly-auth-stored' }, window.location.origin)
    },
  )
})
