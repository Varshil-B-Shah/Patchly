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

// Settings: load saved values on open, save on click
const endpointInput = document.getElementById('azure-endpoint')
const keyInput = document.getElementById('azure-key')
const modelInput = document.getElementById('azure-model')
const saveBtn = document.getElementById('save-settings')
const saveStatus = document.getElementById('save-status')

chrome.storage.local.get(['azureEndpoint', 'azureKey', 'azureModel'], (data) => {
  if (data.azureEndpoint) endpointInput.value = data.azureEndpoint
  if (data.azureKey) keyInput.value = data.azureKey
  if (data.azureModel) modelInput.value = data.azureModel
})

saveBtn.onclick = () => {
  const settings = {
    azureEndpoint: endpointInput.value.trim(),
    azureKey: keyInput.value.trim(),
    azureModel: modelInput.value.trim(),
  }
  chrome.storage.local.set(settings, () => {
    saveStatus.style.display = 'block'
    setTimeout(() => { saveStatus.style.display = 'none' }, 2000)
  })
}
