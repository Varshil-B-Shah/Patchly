// extension/content.js
// NOTE: content scripts cannot use ES module imports
// Use plain variables, no import/export

const AGENT_PORT = 7842
const MSG_PING = 'PATCHLY_PING'
const MSG_PONG = 'PATCHLY_PONG'
const MSG_STATUS = 'PATCHLY_STATUS'

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
        // Notify popup of connection status
        chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: true })
      }
    }

    ws.onclose = () => {
      isConnected = false
      chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: false })
      // Retry connection every 3 seconds
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
