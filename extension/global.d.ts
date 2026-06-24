// extension/global.d.ts
// Typed declarations for the window.__patchly* globals shared between the two
// content scripts (content.ts defines the send functions; overlay.ts defines the
// UI functions). Both bundles must honour this contract.

import type { ReviewComment } from '../shared/comments'

export {}

declare global {
  interface Window {
    // ── Defined by content.ts, called by overlay.ts ──────────────────────────
    __patchlySend?: (payload: Record<string, unknown>) => void
    __patchlySendToAgent?: (data: Record<string, unknown>) => void
    // Direct class panel: send INSPECT (ext→agent) and APPLY_OPS (ext→agent)
    __patchlyInspect?: (patchlySources: string[], sessionId: string) => void
    __patchlyApplyOps?: (operations: Record<string, unknown>[], explanation: string, sessionId: string) => void
    // MCP bridge: on-demand recapture — called when the agent sends SCREENSHOT_REQUEST
    __patchlyHandleScreenshotRequest?: (sessionId: string, patchlySrc?: string) => void

    // MCP bridge: push current browser selection to the agent cache
    __patchlySelectionUpdate?: (selection: Array<{
      patchlySrc: string
      tag: string
      classes: string
      computedStyles?: Record<string, string>
      screenshot?: string | null
      reactInfo?: { componentName: string | null; props: Record<string, unknown> } | null
    }>) => void
    __patchlyGetTheme?: () => Record<string, unknown> | null
    __patchlyGetTailwindConfigured?: () => boolean | null
    __patchlyIsConnected?: () => boolean
    // Cloud identity (Phase D2): cloud info from STATUS + sign-out + identity callback
    __patchlyGetCloudApiUrl?: () => string | null
    __patchlyGetCloudProjectId?: () => string | null
    __patchlySignOut?: () => void
    __patchlyOnIdentity?: (identity: { userId: string; name: string; image?: string } | null) => void

    // ── Defined by overlay.ts, called by content.ts ──────────────────────────
    __patchlyActivate?: () => void
    __patchlyToggle?: () => void
    __patchlySetConnected?: (connected: boolean) => void
    __patchlyCancel?: () => void
    __patchlyResetPromptBar?: () => void

    __patchlyShowLoading?: () => void
    __patchlyUpdateLoading?: (msg: { stage?: string; text?: string }) => void
    __patchlyHideLoading?: () => void

    __patchlyShowPreview?: (msg: Record<string, unknown>) => void
    __patchlyShowPreviewBatch?: (msg: Record<string, unknown>) => void

    __patchlyShowSuccess?: (opts: { filePath: string; showUndo?: boolean; editId?: string | null }) => void
    __patchlyShowError?: (message: string) => void
    __patchlyShowInfo?: (message: string) => void
    __patchlyShowRedirect?: (msg: Record<string, unknown>) => void

    // Direct class panel callbacks (defined by overlay/classPanel, called by content)
    __patchlyShowElementInfo?: (msg: Record<string, unknown>) => void
    __patchlyClassEditError?: (sessionId: string) => void
    __patchlyClassEditApplied?: (sessionId: string) => void
    // Defined by overlay, called by classPanel when its × button closes the panel.
    __patchlyClassPanelClosed?: () => void
    // Defined by overlay, called by classPanel after any undo/redo stack change.
    __patchlyHistoryChanged?: () => void
    // Defined by overlay, called by classPanel on section hover to highlight the DOM element.
    __patchlyHoverBySrc?: (src: string | null) => void

    // Comment mode — send bridges (overlay → content → agent)
    __patchlyAddComment?: (data: Omit<ReviewComment, 'id' | 'createdAt' | 'status'>) => void
    __patchlyListComments?: (sessionId: string, status?: 'open' | 'resolved' | 'all') => void
    __patchlyResolveComment?: (sessionId: string, id: string, resolvedBy: 'dev' | 'agent') => void
    __patchlyDeleteComment?: (id: string) => void
    // Comment mode — inbound handlers (content → overlay)
    __patchlyOnCommentAdded?: (comment: ReviewComment) => void
    __patchlyOnComments?: (sessionId: string, comments: ReviewComment[]) => void
    __patchlyOnCommentResolved?: (id: string, comment: ReviewComment) => void
    __patchlyOnCommentDeleted?: (id: string) => void
    __patchlyOnCommentsCleared?: () => void
  }
}
