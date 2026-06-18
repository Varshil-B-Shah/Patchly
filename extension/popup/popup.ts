// extension/popup/popup.ts

const dot = document.getElementById('status-dot') as HTMLElement
const statusText = document.getElementById('status-text') as HTMLElement
const hintText = document.getElementById('hint-text') as HTMLElement
const shortcut = document.getElementById('shortcut') as HTMLElement

function setConnected(connected: boolean): void {
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
  chrome.tabs.sendMessage(tabs[0].id!, { type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      setConnected(false)
      return
    }
    setConnected((response as { connected?: boolean })?.connected ?? false)
  })
})

// Listen for real-time status updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AGENT_STATUS') {
    setConnected((msg as { connected: boolean }).connected)
  }
})

// ─── Edit-application settings ────────────────────────────────────────────────
const autoApplyEl = document.getElementById('auto-apply') as HTMLInputElement
const thresholdEl = document.getElementById('confidence-threshold') as HTMLSelectElement

chrome.storage.local.get({ autoApply: false, confidenceThreshold: 0.9 }, (s) => {
  const settings = s as { autoApply: boolean; confidenceThreshold: number }
  autoApplyEl.checked = !!settings.autoApply
  thresholdEl.value = String(settings.confidenceThreshold)
  thresholdEl.disabled = !settings.autoApply
})

autoApplyEl.addEventListener('change', () => {
  chrome.storage.local.set({ autoApply: autoApplyEl.checked })
  thresholdEl.disabled = !autoApplyEl.checked
})

thresholdEl.addEventListener('change', () => {
  chrome.storage.local.set({ confidenceThreshold: parseFloat(thresholdEl.value) })
})
