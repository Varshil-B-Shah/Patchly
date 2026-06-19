// extension/content.ts
// Manages the WebSocket connection to the local agent and routes incoming
// messages to the overlay UI (via window.__patchly* globals).

const AGENT_PORT = 7842
const MSG_PING = 'PATCHLY_PING'
const MSG_PONG = 'PATCHLY_PONG'
const MSG_STATUS = 'PATCHLY_STATUS'
const MSG_EDIT_REQUEST = 'PATCHLY_EDIT_REQUEST'

let ws: WebSocket | null = null
let isConnected = false

function connect(): void {
  try {
    ws = new WebSocket(`ws://localhost:${AGENT_PORT}`)

    ws.onopen = () => {
      ws!.send(JSON.stringify({ type: MSG_PING }))
    }

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>

      if (msg.type === MSG_PONG || msg.type === MSG_STATUS) {
        isConnected = true
        try {
          chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: true })
        } catch { return }
      }

      if (msg.type === 'PATCHLY_PROGRESS') {
        window.__patchlyUpdateLoading?.(msg as { stage?: string; text?: string })
      }

      if (msg.type === 'PATCHLY_PREVIEW') {
        window.__patchlyHideLoading?.()
        window.__patchlyResetPromptBar?.()
        window.__patchlyShowPreview?.(msg)
      }

      if (msg.type === 'PATCHLY_PREVIEW_BATCH') {
        window.__patchlyHideLoading?.()
        window.__patchlyResetPromptBar?.()
        window.__patchlyShowPreviewBatch?.(msg)
      }

      if (msg.type === 'PATCHLY_EDIT_DONE') {
        window.__patchlyHideLoading?.()
        recordEdit(msg)
        window.__patchlyShowSuccess?.({ filePath: String(msg.filePath ?? ''), editId: msg.editId as string | null })
      }

      if (msg.type === 'PATCHLY_EDIT_ERROR') {
        window.__patchlyHideLoading?.()
        window.__patchlyResetPromptBar?.()
        window.__patchlyShowError?.(String(msg.message ?? ''))
      }

      if (msg.type === 'PATCHLY_INFO') {
        window.__patchlyHideLoading?.()
        window.__patchlyResetPromptBar?.()
        window.__patchlyShowInfo?.(String(msg.message ?? ''))
      }

      if (msg.type === 'PATCHLY_REDIRECT') {
        window.__patchlyHideLoading?.()
        window.__patchlyShowRedirect?.(msg)
      }

      if (msg.type === 'PATCHLY_UNDO_DONE') {
        removeEdit(String(msg.editId ?? ''))
        window.__patchlyShowSuccess?.({ filePath: 'Undone', showUndo: false })
      }
    }

    ws.onclose = () => {
      isConnected = false
      try {
        chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: false })
      } catch {
        // Extension was reloaded — stop retrying, new content script will take over
        return
      }
      setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      isConnected = false
    }
  } catch {
    setTimeout(connect, 3000)
  }
}

// Respond to popup asking for current status, and handle activation from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected })
    return true
  }
  if (msg.type === 'ACTIVATE_PATCHLY') {
    window.__patchlyActivate?.()
  }
})

// ─── Edit history persistence (chrome.storage.session) ───────────────────────
const HISTORY_KEY = 'patchly_edits'
let firstEditThisLoad = true

interface EditEntry {
  editId: string
  filePath: string
  lineNumber?: number
  explanation?: string
  ts: number
  undone?: boolean
}

function getEdits(cb: (edits: EditEntry[]) => void): void {
  try {
    chrome.storage.session.get({ [HISTORY_KEY]: [] }, (res) => {
      cb(chrome.runtime.lastError ? [] : ((res[HISTORY_KEY] as EditEntry[]) || []))
    })
  } catch {
    cb([])
  }
}

function setEdits(edits: EditEntry[], done?: () => void): void {
  try {
    chrome.storage.session.set({ [HISTORY_KEY]: edits }, () => done?.())
  } catch {
    done?.()
  }
}

function recordEdit(msg: Record<string, unknown>): void {
  getEdits((edits) => {
    edits.push({
      editId: String(msg.editId ?? ''),
      filePath: String(msg.filePath ?? ''),
      lineNumber: msg.lineNumber as number | undefined,
      explanation: msg.explanation as string | undefined,
      ts: Date.now(),
    })
    setEdits(edits, () => {
      window.__patchlyRenderHistory?.()
      // Auto-open the sidebar on the first edit of this page load.
      if (firstEditThisLoad) {
        firstEditThisLoad = false
        window.__patchlyOpenHistory?.()
      }
    })
  })
}

function removeEdit(editId: string): void {
  getEdits((edits) => {
    const next = editId ? edits.filter((e) => e.editId !== editId) : edits.slice(0, -1)
    setEdits(next, () => {
      window.__patchlyRenderHistory?.()
    })
  })
}

// Hydrate the sidebar from any edits persisted earlier this session. Deferred so
// overlay.ts (loaded after content.ts) has registered __patchlyRenderHistory.
setTimeout(() => {
  getEdits((edits) => {
    if (edits.length) {
      firstEditThisLoad = false // don't auto-open just for rehydration
      window.__patchlyRenderHistory?.()
    }
  })
}, 0)

// Send an EDIT_REQUEST to the agent over the existing WebSocket
function sendEditRequest(payload: Record<string, unknown>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Patchly] Agent not connected — cannot send edit request')
    return
  }
  ws.send(JSON.stringify({ type: MSG_EDIT_REQUEST, ...payload }))
}

window.__patchlySend = sendEditRequest

// Generic send — used by overlay.ts for CONFIRM/REJECT after preview toast
window.__patchlySendToAgent = function (data: Record<string, unknown>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(data))
}

// Start connecting when page loads
connect()

// Keyboard shortcut: Alt+Shift+P activates selection mode, Esc cancels
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.altKey && e.shiftKey && e.key === 'P') {
    e.preventDefault()
    window.__patchlyActivate?.()
  }
  if (e.key === 'Escape') {
    window.__patchlyCancel?.()
  }
})
