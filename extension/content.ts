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
let cachedTheme: Record<string, unknown> | null = null         // ThemeTokens from STATUS
let cachedTailwindConfigured: boolean | null = null            // from STATUS

function setConnected(connected: boolean): void {
  isConnected = connected
  window.__patchlySetConnected?.(connected)
}

function connect(): void {
  try {
    ws = new WebSocket(`ws://localhost:${AGENT_PORT}`)

    ws.onopen = () => {
      ws!.send(JSON.stringify({ type: MSG_PING }))
    }

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>

      if (msg.type === MSG_PONG || msg.type === MSG_STATUS) {
        setConnected(true)
        if (msg.type === MSG_STATUS) {
          if (msg.theme) cachedTheme = msg.theme as Record<string, unknown>
          if (typeof msg.tailwindConfigured === 'boolean') cachedTailwindConfigured = msg.tailwindConfigured
        }
      }

      if (msg.type === 'PATCHLY_ELEMENT_INFO') {
        window.__patchlyShowElementInfo?.(msg)
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
        window.__patchlyShowSuccess?.({ filePath: String(msg.filePath ?? ''), editId: msg.editId as string | null })
      }

      if (msg.type === 'PATCHLY_OPS_APPLIED') {
        window.__patchlyClassEditApplied?.(String(msg.sessionId ?? ''))
      }

      if (msg.type === 'PATCHLY_EDIT_ERROR') {
        window.__patchlyHideLoading?.()
        window.__patchlyResetPromptBar?.()
        window.__patchlyClassEditError?.(String(msg.sessionId ?? ''))  // revert optimistic class edit (no-op if not ours)
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
        window.__patchlyShowSuccess?.({ filePath: 'Undone', showUndo: false })
      }
    }

    ws.onclose = () => {
      setConnected(false)
      setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      setConnected(false)
    }
  } catch {
    setTimeout(connect, 3000)
  }
}

// Toolbar icon click → background sends TOGGLE_PATCHLY to toggle editing mode.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_PATCHLY') {
    window.__patchlyToggle?.()
  }
})

// Send an EDIT_REQUEST to the agent over the existing WebSocket
function sendEditRequest(payload: Record<string, unknown>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Patchly] Agent not connected — cannot send edit request')
    return
  }
  ws.send(JSON.stringify({ type: MSG_EDIT_REQUEST, ...payload }))
}

window.__patchlySend = sendEditRequest

// Generic send — used by overlay.ts for CONFIRM/REJECT/UNDO
window.__patchlySendToAgent = function (data: Record<string, unknown>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(data))
}

// Direct class panel: ask agent to read element(s) className from source
window.__patchlyInspect = function (patchlySources: string[], sessionId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'PATCHLY_INSPECT', patchlySources, sessionId }))
}

// Direct class panel: apply pre-built operations (no LLM, no preview)
window.__patchlyApplyOps = function (
  operations: Record<string, unknown>[],
  explanation: string,
  sessionId: string,
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'PATCHLY_APPLY_OPS', sessionId, operations, explanation }))
}

// Expose cached agent state for overlay.ts (theme, tailwind gate, connection).
;(window as unknown as Record<string, unknown>).__patchlyGetTheme = (): Record<string, unknown> | null => cachedTheme
;(window as unknown as Record<string, unknown>).__patchlyGetTailwindConfigured = (): boolean | null => cachedTailwindConfigured
;(window as unknown as Record<string, unknown>).__patchlyIsConnected = (): boolean => isConnected

// Start connecting when page loads
connect()

// Esc exits editing mode.
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    window.__patchlyCancel?.()
  }
})
