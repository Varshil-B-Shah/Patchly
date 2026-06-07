// extension/content.js
// NOTE: content scripts cannot use ES module imports
// Use plain variables, no import/export

const AGENT_PORT = 7842
const MSG_PING = 'PATCHLY_PING'
const MSG_PONG = 'PATCHLY_PONG'
const MSG_STATUS = 'PATCHLY_STATUS'
const MSG_EDIT_REQUEST = 'PATCHLY_EDIT_REQUEST'

let ws = null
let isConnected = false

function connect() {
  try {
    ws = new WebSocket(`ws://localhost:${AGENT_PORT}`)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: MSG_PING }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === MSG_PONG || msg.type === MSG_STATUS) {
        isConnected = true
        try {
          chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: true })
        } catch (e) { return }
      }

      if (msg.type === 'PATCHLY_PREVIEW') {
        if (window.__patchlyShowPreview) window.__patchlyShowPreview(msg)
      }

      if (msg.type === 'PATCHLY_EDIT_DONE') {
        if (window.__patchlyShowSuccess) window.__patchlyShowSuccess({ filePath: msg.filePath })
      }

      if (msg.type === 'PATCHLY_EDIT_ERROR') {
        if (window.__patchlyShowError) window.__patchlyShowError(msg.message)
      }

      if (msg.type === 'PATCHLY_INFO') {
        if (window.__patchlyShowInfo) window.__patchlyShowInfo(msg.message)
      }

      if (msg.type === 'PATCHLY_UNDO_DONE') {
        if (window.__patchlyShowSuccess) window.__patchlyShowSuccess({ filePath: 'Undone', showUndo: false })
      }
    }

    ws.onclose = () => {
      isConnected = false
      try {
        chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: false })
      } catch (e) {
        // Extension was reloaded — stop retrying, new content script will take over
        return
      }
      setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      isConnected = false
    }

  } catch (e) {
    setTimeout(connect, 3000)
  }
}

// Respond to popup asking for current status, and handle activation from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected })
    return true
  }
  if (msg.type === 'ACTIVATE_PATCHLY') {
    if (window.__patchlyActivate) window.__patchlyActivate()
  }
})

// Send an EDIT_REQUEST to the agent over the existing WebSocket
function sendEditRequest(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Patchly] Agent not connected — cannot send edit request')
    return
  }
  ws.send(JSON.stringify({ type: MSG_EDIT_REQUEST, ...payload }))
}

window.__patchlySend = sendEditRequest

// Generic send — used by overlay.js for CONFIRM/REJECT after preview toast
window.__patchlySendToAgent = function(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(data))
}

// Start connecting when page loads
connect()

// Keyboard shortcut: Alt+Shift+P activates selection mode, Esc cancels
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.shiftKey && e.key === 'P') {
    e.preventDefault()
    if (window.__patchlyActivate) window.__patchlyActivate()
  }
  if (e.key === 'Escape' && window.__patchlyCancel) {
    window.__patchlyCancel()
  }
})
