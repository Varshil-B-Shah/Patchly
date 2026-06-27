interface AuthMessage {
  source: 'patchly-auth'
  token: string
  identity: { userId: string; name: string; image?: string }
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return
  const data = event.data as AuthMessage | undefined
  if (!data || data.source !== 'patchly-auth' || typeof data.token !== 'string') return

  chrome.storage.local.set(
    { patchlyMemberToken: data.token, patchlyIdentity: data.identity },
    () => {
      window.postMessage({ source: 'patchly-auth-stored' }, window.location.origin)
    },
  )
})
