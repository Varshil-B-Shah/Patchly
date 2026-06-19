// extension/global.d.ts
// Typed declarations for the window.__patchly* globals shared between the two
// content scripts (content.ts defines the send functions; overlay.ts defines the
// UI functions). Both bundles must honour this contract.

export {}

declare global {
  interface Window {
    // ── Defined by content.ts, called by overlay.ts ──────────────────────────
    __patchlySend?: (payload: Record<string, unknown>) => void
    __patchlySendToAgent?: (data: Record<string, unknown>) => void

    // ── Defined by overlay.ts, called by content.ts ──────────────────────────
    __patchlyActivate?: () => void
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

    __patchlyRenderHistory?: () => void
    __patchlyOpenHistory?: () => void
  }
}
