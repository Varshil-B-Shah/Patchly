// extension/popup/popup.js

const dot = document.getElementById('status-dot')
const statusText = document.getElementById('status-text')
const hintText = document.getElementById('hint-text')
const shortcut = document.getElementById('shortcut')

function setConnected(connected) {
  if (connected) {
    dot.className = 'dot connected'
    statusText.textContent = 'Agent connected'
    hintText.textContent = 'Open your localhost app and activate Patchly.'
    shortcut.style.display = 'block'
  } else {
    dot.className = 'dot disconnected'
    statusText.textContent = 'Agent not running'
    hintText.innerHTML = 'Run <code>npx patchly</code> in your project folder to start the agent.'
    shortcut.style.display = 'none'
  }
}

// Ask the active tab's content script for current status
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return
  chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      setConnected(false)
      return
    }
    setConnected(response?.connected ?? false)
  })
})

// Listen for real-time status updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AGENT_STATUS') {
    setConnected(msg.connected)
  }
})
