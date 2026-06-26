// extension/content.ts
// Manages the WebSocket connection to the local agent and routes incoming
// messages to the overlay UI (via window.__patchly* globals).

// Stamp the DOM so page scripts (like patchly-overlay.js) can detect the extension.
// Skip on the Patchly dashboard itself (it self-identifies via a meta tag) to avoid
// SSR hydration mismatches. A meta check — not host/port — so a user's Next app on
// :3000 is NOT mistaken for the dashboard.
// Signal the overlay (patchly-overlay.js, which runs in the page world) that the
// extension is present. sessionStorage is shared between the isolated world and the
// page world, touches no DOM, and clears when the tab closes — zero hydration impact.
const _isDashboard = !!document.querySelector('meta[name="patchly-dashboard"]')
if (!_isDashboard) {
  try { sessionStorage.setItem('__patchly_ext', '1') } catch { /* storage blocked */ }
}

import { DEFAULT_PORT, PORT_SCAN_RANGE } from '../shared/agentInfo.js'
import type { ReviewComment } from '../shared/comments'

// Browsers can't read the agent's lockfile, so we scan a small port range and
// connect to the first agent that responds. STATUS.projectRoot then tells us
// which project we reached.
const CANDIDATE_PORTS = Array.from({ length: PORT_SCAN_RANGE + 1 }, (_, i) => DEFAULT_PORT + i)
let portIdx = 0
const MSG_PING = 'PATCHLY_PING'
const MSG_PONG = 'PATCHLY_PONG'
const MSG_STATUS = 'PATCHLY_STATUS'
const MSG_EDIT_REQUEST = 'PATCHLY_EDIT_REQUEST'

let ws: WebSocket | null = null
let isConnected = false
let cachedTheme: Record<string, unknown> | null = null         // ThemeTokens from STATUS
let cachedTailwindConfigured: boolean | null = null            // from STATUS
let cachedCloudApiUrl: string | null = null                    // from STATUS (cloud mode)
let cachedCloudProjectId: string | null = null                 // from STATUS (cloud mode)

// Read the stored member token (set by authBridge after GitHub sign-in) and push
// it to the agent so cloud comment writes are attributed to the verified member.
function pushIdentity(): void {
  chrome.storage.local.get(['patchlyMemberToken', 'patchlyIdentity'], (r) => {
    const token = (r.patchlyMemberToken as string | undefined) ?? null
    const identity = (r.patchlyIdentity as { userId: string; name: string; image?: string } | undefined) ?? null
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PATCHLY_SET_IDENTITY', token }))
    }
    window.__patchlyOnIdentity?.(identity)
  })
}

// authBridge writes the token → forward to the agent + update the toolbar chip.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.patchlyMemberToken) pushIdentity()
})

// Push identity immediately on page load so the toolbar chip reflects sign-in
// state as soon as the extension is opened — no need to wait for a WS STATUS.
pushIdentity()

function setConnected(connected: boolean): void {
  isConnected = connected
  window.__patchlySetConnected?.(connected)
}

function connect(): void {
  try {
    const port = CANDIDATE_PORTS[portIdx]
    ws = new WebSocket(`ws://localhost:${port}`)

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
          cachedCloudApiUrl = (msg.cloudApiUrl as string | null) ?? null
          cachedCloudProjectId = (msg.cloudProjectId as string | null) ?? null
          pushIdentity() // send any stored member token now that we're connected
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

      if (msg.type === 'PATCHLY_SCREENSHOT_REQUEST') {
        window.__patchlyHandleScreenshotRequest?.(String(msg.sessionId ?? ''), msg.patchlySrc as string | undefined)
      }

      if (msg.type === 'PATCHLY_COMMENT_ADDED') {
        window.__patchlyOnCommentAdded?.(msg.comment as ReviewComment)
      }
      if (msg.type === 'PATCHLY_COMMENTS') {
        window.__patchlyOnComments?.(msg.sessionId as string, msg.comments as ReviewComment[])
      }
      if (msg.type === 'PATCHLY_COMMENT_RESOLVED') {
        window.__patchlyOnCommentResolved?.(msg.id as string, msg.comment as ReviewComment)
      }
      if (msg.type === 'PATCHLY_COMMENT_DELETED') {
        window.__patchlyOnCommentDeleted?.(msg.id as string)
      }
      if (msg.type === 'PATCHLY_COMMENTS_CLEARED') {
        window.__patchlyOnCommentsCleared?.()
      }
      // REPLY_ADDED carries the full updated comment — reuse COMMENT_ADDED handler
      // so the pin rebuilds with the new reply visible.
      if (msg.type === 'PATCHLY_REPLY_ADDED') {
        window.__patchlyOnCommentAdded?.(msg.comment as ReviewComment)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      // Advance to the next candidate port; wait longer only after a full sweep.
      portIdx = (portIdx + 1) % CANDIDATE_PORTS.length
      setTimeout(connect, portIdx === 0 ? 3000 : 150)
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

// MCP bridge: push the current browser selection to the agent's in-memory cache
// so the MCP server can answer patchly_current_selection() without polling the DOM.
window.__patchlySelectionUpdate = function (
  selection: Array<{
    patchlySrc: string
    tag: string
    classes: string
    computedStyles?: Record<string, string>
    screenshot?: string | null
    reactInfo?: { componentName: string | null; props: Record<string, unknown> } | null
  }>,
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'PATCHLY_SELECTION_UPDATE', selection }))
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

window.__patchlyAddComment = function (data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'PATCHLY_ADD_COMMENT', comment: data }))
}
window.__patchlyListComments = function (sessionId, status) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'PATCHLY_LIST_COMMENTS', sessionId, status }))
}
window.__patchlyResolveComment = function (sessionId, id, resolvedBy) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'PATCHLY_RESOLVE_COMMENT', sessionId, id, resolvedBy }))
}
window.__patchlyDeleteComment = function (id) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'PATCHLY_DELETE_COMMENT', id }))
}

// Expose cached agent state for overlay.ts (theme, tailwind gate, connection).
;(window as unknown as Record<string, unknown>).__patchlyGetTheme = (): Record<string, unknown> | null => cachedTheme
;(window as unknown as Record<string, unknown>).__patchlyGetTailwindConfigured = (): boolean | null => cachedTailwindConfigured
;(window as unknown as Record<string, unknown>).__patchlyIsConnected = (): boolean => isConnected
;(window as unknown as Record<string, unknown>).__patchlyGetCloudApiUrl = (): string | null => cachedCloudApiUrl
;(window as unknown as Record<string, unknown>).__patchlyGetCloudProjectId = (): string | null => cachedCloudProjectId

// Sign out of the extension identity: clear storage + tell the agent to drop the token.
window.__patchlySignOut = function (): void {
  chrome.storage.local.remove(['patchlyMemberToken', 'patchlyIdentity'], () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PATCHLY_SET_IDENTITY', token: null }))
    }
    window.__patchlyOnIdentity?.(null)
  })
}

// Start connecting when page loads
connect()

// Push any stored member identity on page load (covers page refresh after sign-in).
pushIdentity()

// Esc exits editing mode.
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    window.__patchlyCancel?.()
  }
})
