// extension/classPanel.ts
// Direct Tailwind class editing panel — no LLM in the loop.
// Bundled into overlay.js by esbuild (imported by overlay.ts).

import { computeClassAdd, computeClassRemove, applyClassEdit } from '../shared/tailwindClasses.js'
import type { ElementInfoMessage, ThemeTokens } from '../shared/protocol.js'
import type { SetClassNameOp, EditTarget } from '../shared/operations.js'

// Standard Tailwind scales for quick-toggle groups. Hardcoded — no project
// dependency. Color swatches use the project theme from ThemeTokens instead.
const QUICK_GROUPS: ReadonlyArray<{ label: string; classes: readonly string[] }> = [
  { label: 'Padding X', classes: ['px-1','px-2','px-3','px-4','px-5','px-6','px-8','px-10','px-12'] },
  { label: 'Padding Y', classes: ['py-1','py-2','py-3','py-4','py-5','py-6','py-8','py-10','py-12'] },
  { label: 'Radius',    classes: ['rounded','rounded-md','rounded-lg','rounded-xl','rounded-2xl','rounded-full'] },
  { label: 'Text size', classes: ['text-xs','text-sm','text-base','text-lg','text-xl','text-2xl','text-3xl'] },
  { label: 'Weight',    classes: ['font-normal','font-medium','font-semibold','font-bold'] },
]

// ─── Module state ─────────────────────────────────────────────────────────────
let panelEl: HTMLDivElement | null = null
let currentClasses: string[] = []
let currentInfo: ElementInfoMessage | null = null
let currentTheme: ThemeTokens = { colors: [] }
let pendingRevert: string[] | null = null  // pre-op snapshot; null = not pending

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/** Called once from overlay.ts init(). Creates the panel container. */
export function initClassPanel(): void {
  if (document.getElementById('patchly-class-panel')) return
  panelEl = document.createElement('div')
  panelEl.id = 'patchly-class-panel'
  panelEl.style.display = 'none'
  document.body.appendChild(panelEl)
}

/**
 * Called by overlay.ts when ELEMENT_INFO arrives and the Classes tab is active.
 * Positions the panel near `anchorRect` (the selection rect).
 */
export function showClassPanel(
  info: ElementInfoMessage,
  theme: ThemeTokens,
  anchorRect: { x: number; y: number; width: number; height: number },
): void {
  currentInfo = info
  currentTheme = theme
  currentClasses = info.classNameKind === 'static' ? [...info.classes] : []
  pendingRevert = null
  renderPanel()

  if (panelEl) {
    panelEl.style.display = 'block'
    // Position below-right of the anchor selection, clamped to viewport
    const panelW = 340
    const estimatedH = 420
    let left = anchorRect.x
    let top = anchorRect.y + anchorRect.height + 8
    if (left + panelW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - panelW - 8)
    if (top + estimatedH > window.innerHeight - 8) top = Math.max(8, anchorRect.y - estimatedH - 8)
    panelEl.style.left = left + 'px'
    panelEl.style.top = top + 'px'
  }
}

/** Called from overlay cancel() and when switching back to AI tab. */
export function hideClassPanel(): void {
  if (panelEl) panelEl.style.display = 'none'
  currentInfo = null
  currentClasses = []
  pendingRevert = null
}

/**
 * Called by content.ts on EDIT_ERROR when a class panel op fails.
 * Reverts the optimistic class model and re-renders.
 */
export function classEditError(): void {
  if (pendingRevert !== null) {
    currentClasses = pendingRevert
    pendingRevert = null
    renderPanel()
  }
}

// ─── Op dispatch ─────────────────────────────────────────────────────────────

function buildTarget(): EditTarget | null {
  if (!currentInfo) return null
  return {
    file: currentInfo.filePath,
    line: currentInfo.lineNumber,
    column: currentInfo.column,
    tagName: currentInfo.tagName,
  }
}

function sendOp(add: string[], remove: string[], explanation: string): void {
  const target = buildTarget()
  if (!target) return
  const op: SetClassNameOp = { op: 'setClassName', target, add, remove }
  const sessionId = Math.random().toString(36).slice(2)
  window.__patchlyApplyOps?.([op as unknown as Record<string, unknown>], explanation, sessionId)
}

function doEdit(add: string[], remove: string[]): void {
  if (!currentInfo) return
  pendingRevert = [...currentClasses]
  currentClasses = applyClassEdit(currentClasses, { add, remove })
  renderPanel()
  const verb = add.length && remove.length ? 'Changed' : add.length ? 'Added' : 'Removed'
  const cls = [...add, ...remove][0] ?? 'class'
  sendOp(add, remove, `${verb} ${cls} on <${currentInfo.tagName}>`)
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderPanel(): void {
  if (!panelEl || !currentInfo) return
  const info = currentInfo
  const isDynamic = info.classNameKind === 'dynamic'
  const isNone = info.classNameKind === 'none'

  const srcParts = (info.filePath ?? '').split('/')
  const fileLabel = `${srcParts[srcParts.length - 1]}:${info.lineNumber}`

  // ── Current class chips ────
  let chipsHtml: string
  if (isDynamic) {
    chipsHtml = `<div class="patchly-cp-dynamic">
      🔒 <code class="patchly-cp-dynamic-code">${esc(info.dynamicText ?? 'dynamic className')}</code>
      <div class="patchly-cp-dynamic-note">Dynamic className — use the AI tab to edit</div>
    </div>`
  } else if (currentClasses.length === 0 && isNone) {
    chipsHtml = '<span class="patchly-cp-empty">No className yet — add one below</span>'
  } else if (currentClasses.length === 0) {
    chipsHtml = '<span class="patchly-cp-empty">All classes removed</span>'
  } else {
    chipsHtml = currentClasses.map((cls) =>
      `<span class="patchly-cp-chip">${esc(cls)}<button class="patchly-cp-rm" data-cls="${esc(cls)}" title="Remove">×</button></span>`
    ).join('')
  }

  // ── Quick groups (hidden when dynamic) ────
  const groupsHtml = isDynamic ? '' : QUICK_GROUPS.map((g) =>
    `<div class="patchly-cp-group">
      <div class="patchly-cp-group-label">${esc(g.label)}</div>
      <div class="patchly-cp-group-btns">
        ${(g.classes as readonly string[]).map((cls) =>
          `<button class="patchly-cp-gbtn${currentClasses.includes(cls) ? ' active' : ''}" data-cls="${esc(cls)}">${esc(cls)}</button>`
        ).join('')}
      </div>
    </div>`
  ).join('')

  // ── Color swatches (hidden when dynamic or no theme) ────
  const swatchesHtml = (isDynamic || currentTheme.colors.length === 0) ? '' :
    `<div class="patchly-cp-group">
      <div class="patchly-cp-group-label">Background · from your theme</div>
      <div class="patchly-cp-swatches">
        ${currentTheme.colors.map((c) => {
          const cls = `bg-${c.name}`
          return `<button class="patchly-cp-swatch${currentClasses.includes(cls) ? ' active' : ''}"
                          data-cls="${esc(cls)}" title="${esc(c.name)}"
                          style="background:${esc(c.value)}"></button>`
        }).join('')}
      </div>
    </div>`

  panelEl.innerHTML = `
    <div class="patchly-cp-head">
      <span class="patchly-cp-tag">&lt;${esc(info.tagName)}&gt;</span>
      <span class="patchly-cp-loc">${esc(fileLabel)}</span>
    </div>
    <div class="patchly-cp-label">Classes on this element</div>
    <div class="patchly-cp-chips">${chipsHtml}</div>
    ${isDynamic ? '' : `
      <div class="patchly-cp-add">
        <span class="patchly-cp-add-icon">🔍</span>
        <input class="patchly-cp-add-input" type="text" placeholder="add a class…" autocomplete="off" />
      </div>
    `}
    <div class="patchly-cp-groups">
      ${groupsHtml}
      ${swatchesHtml}
    </div>
  `

  // Wire chip removes
  panelEl.querySelectorAll<HTMLButtonElement>('.patchly-cp-rm').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const cls = btn.getAttribute('data-cls')!
      const edit = computeClassRemove(cls)
      doEdit(edit.add, edit.remove)
    }
  })

  // Wire quick group toggles — clicking an active button removes it, inactive adds (with conflict res)
  panelEl.querySelectorAll<HTMLButtonElement>('.patchly-cp-gbtn').forEach((btn) => {
    btn.onclick = () => {
      const cls = btn.getAttribute('data-cls')!
      if (currentClasses.includes(cls)) {
        const edit = computeClassRemove(cls)
        doEdit(edit.add, edit.remove)
      } else {
        const edit = computeClassAdd(currentClasses, cls)
        doEdit(edit.add, edit.remove)
      }
    }
  })

  // Wire swatches — toggle on/off
  panelEl.querySelectorAll<HTMLButtonElement>('.patchly-cp-swatch').forEach((btn) => {
    btn.onclick = () => {
      const cls = btn.getAttribute('data-cls')!
      if (currentClasses.includes(cls)) {
        const edit = computeClassRemove(cls)
        doEdit(edit.add, edit.remove)
      } else {
        const edit = computeClassAdd(currentClasses, cls)
        doEdit(edit.add, edit.remove)
      }
    }
  })

  // Wire add input — Enter to apply
  const addInput = panelEl.querySelector<HTMLInputElement>('.patchly-cp-add-input')
  if (addInput) {
    addInput.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        const cls = addInput.value.trim()
        if (!cls) return
        addInput.value = ''
        const edit = computeClassAdd(currentClasses, cls)
        doEdit(edit.add, edit.remove)
      }
      if (e.key === 'Escape') e.stopPropagation()  // don't cancel selection
    })
    addInput.addEventListener('click', (e) => e.stopPropagation())
    addInput.addEventListener('mousedown', (e) => e.stopPropagation())
  }

  // Prevent clicks inside panel from propagating to the overlay canvas
  panelEl.addEventListener('mousedown', (e) => e.stopPropagation(), { once: false })
}
