// background.js
// MV3 service worker — handles screenshot capture requests from content scripts.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CAPTURE_SCREENSHOT') {
    // Use callback form — Promise + return true can drop the response if the
    // MV3 service worker goes idle while the promise is still pending.
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message })
      } else {
        sendResponse({ ok: true, dataUrl })
      }
    })
    return true  // keep channel open for the async callback
  }
})
