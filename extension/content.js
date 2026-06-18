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

      if (msg.type === 'PATCHLY_PROGRESS') {
        if (window.__patchlyUpdateLoading) window.__patchlyUpdateLoading(msg)
      }

      if (msg.type === 'PATCHLY_PREVIEW') {
        if (window.__patchlyHideLoading) window.__patchlyHideLoading()
        if (window.__patchlyResetPromptBar) window.__patchlyResetPromptBar()
        if (window.__patchlyShowPreview) window.__patchlyShowPreview(msg)
      }

      if (msg.type === 'PATCHLY_PREVIEW_BATCH') {
        if (window.__patchlyHideLoading) window.__patchlyHideLoading()
        if (window.__patchlyResetPromptBar) window.__patchlyResetPromptBar()
        if (window.__patchlyShowPreviewBatch) window.__patchlyShowPreviewBatch(msg)
      }

      if (msg.type === 'PATCHLY_EDIT_DONE') {
        if (window.__patchlyHideLoading) window.__patchlyHideLoading()
        recordEdit(msg)
        if (window.__patchlyShowSuccess) {
          window.__patchlyShowSuccess({ filePath: msg.filePath, editId: msg.editId })
        }
      }

      if (msg.type === 'PATCHLY_EDIT_ERROR') {
        if (window.__patchlyHideLoading) window.__patchlyHideLoading()
        if (window.__patchlyResetPromptBar) window.__patchlyResetPromptBar()
        if (window.__patchlyShowError) window.__patchlyShowError(msg.message)
      }

      if (msg.type === 'PATCHLY_INFO') {
        if (window.__patchlyHideLoading) window.__patchlyHideLoading()
        if (window.__patchlyResetPromptBar) window.__patchlyResetPromptBar()
        if (window.__patchlyShowInfo) window.__patchlyShowInfo(msg.message)
      }

      if (msg.type === 'PATCHLY_REDIRECT') {
        if (window.__patchlyHideLoading) window.__patchlyHideLoading()
        if (window.__patchlyShowRedirect) window.__patchlyShowRedirect(msg)
      }

      if (msg.type === 'PATCHLY_UNDO_DONE') {
        removeEdit(msg.editId)
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

// ─── Edit history persistence (chrome.storage.session) ───────────────────────
const HISTORY_KEY = 'patchly_edits'
let firstEditThisLoad = true

function getEdits(cb) {
  try {
    chrome.storage.session.get({ [HISTORY_KEY]: [] }, (res) => {
      cb(chrome.runtime.lastError ? [] : (res[HISTORY_KEY] || []))
    })
  } catch {
    cb([])
  }
}

function setEdits(edits, done) {
  try {
    chrome.storage.session.set({ [HISTORY_KEY]: edits }, () => done && done())
  } catch {
    done && done()
  }
}

function recordEdit(msg) {
  getEdits((edits) => {
    edits.push({
      editId: msg.editId,
      filePath: msg.filePath,
      lineNumber: msg.lineNumber,
      explanation: msg.explanation,
      ts: Date.now(),
    })
    setEdits(edits, () => {
      if (window.__patchlyRenderHistory) window.__patchlyRenderHistory()
      // Auto-open the sidebar on the first edit of this page load.
      if (firstEditThisLoad && window.__patchlyOpenHistory) {
        firstEditThisLoad = false
        window.__patchlyOpenHistory()
      }
    })
  })
}

function removeEdit(editId) {
  getEdits((edits) => {
    const next = editId ? edits.filter((e) => e.editId !== editId) : edits.slice(0, -1)
    setEdits(next, () => {
      if (window.__patchlyRenderHistory) window.__patchlyRenderHistory()
    })
  })
}

// Hydrate the sidebar from any edits persisted earlier this session. Deferred so
// overlay.js (loaded after content.js) has registered __patchlyRenderHistory.
setTimeout(() => {
  getEdits((edits) => {
    if (edits.length) {
      firstEditThisLoad = false  // don't auto-open just for rehydration
      if (window.__patchlyRenderHistory) window.__patchlyRenderHistory()
    }
  })
}, 0)

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
