chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PATCHLY' }, () => {
    void chrome.runtime.lastError
  })
})

chrome.runtime.onMessage.addListener(
  (msg, sender, sendResponse) => {
    if (msg.type === 'CAPTURE_SCREENSHOT') {
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
      return true
    }
  },
)
