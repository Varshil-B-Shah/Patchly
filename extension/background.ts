// extension/background.ts
// MV3 service worker — handles screenshot capture requests from content scripts.

// chrome.storage.session defaults to TRUSTED_CONTEXTS only, which excludes
// content scripts. The edit-history sidebar (in overlay.ts, a content script)
// reads/writes session storage, so grant untrusted contexts access.
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

chrome.runtime.onMessage.addListener(
  (msg, sender, sendResponse) => {
    if (msg.type === 'CAPTURE_SCREENSHOT') {
      // Use callback form — Promise + return true can drop the response if the
      // MV3 service worker goes idle while the promise is still pending.
      const windowId = sender.tab?.windowId
      if (windowId == null) {
        sendResponse({ ok: false, error: 'No tab window ID' })
        return true
      }
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message })
        } else {
          sendResponse({ ok: true, dataUrl })
        }
      })
      return true // keep channel open for the async callback
    }
  },
)
