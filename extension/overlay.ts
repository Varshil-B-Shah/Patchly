// extension/overlay.ts
// All in-page editing UI: the floating toolbar, element selection (AI + Tailwind
// modes), the AI prompt bar, preview/toast panels. Bundled as an IIFE by esbuild.

import {
  initClassPanel, showClassPanel, hideClassPanel, classEditError, classEditApplied,
  undo as classUndo, redo as classRedo, canUndo as classCanUndo, canRedo as classCanRedo,
} from './classPanel.js'
import type { ClassInfo, ThemeTokens } from '../shared/protocol.js'

const DRAG_THRESHOLD = 5 // px of movement that turns a click into an area drag

interface SrcCandidate {
  el: Element
  src: string
  area: number
}
interface SelectionRect { x: number; y: number; width: number; height: number }

// ─── State ──────────────────────────────────────────────────────────────────────
let isActive = false            // editing mode on/off
let activeMode: 'ai' | 'tailwind' | 'comment' = 'ai'

// Comment mode state
let commentComposerEl: HTMLDivElement | null = null
let commentPendingEl: Element | null = null
let commentPendingPatchlySrc: string | null = null
let commentPendingScreenshot: string | null = null
let commentPendingReactInfo: ReturnType<typeof getReactInfo> | null = null
let commentAreaRect: { x: number; y: number; w: number; h: number } | null = null
let cachedComments: import('../shared/comments').ReviewComment[] = []
let pinsContainerEl: HTMLDivElement | null = null
let commentSidebarEl: HTMLDivElement | null = null
let listCommentsSessionId: string | null = null
let mouseDown = false
let isDragging = false
let startX = 0, startY = 0
let currentX = 0, currentY = 0

let selectedElement: Element | null = null   // AI single / batch anchor
let selectedPatchlySrc: string | null = null
let selectedTargets: Element[] | null = null // AI batch (from picker)
let selectedSet: Element[] = []              // Tailwind multi-select (Ctrl+Click)
let pendingInspectSessionId: string | null = null

// DOM (created once)
let root: HTMLDivElement | null = null
let toolbar: HTMLDivElement | null = null
let selectionRect: HTMLDivElement | null = null
let elementHighlight: HTMLDivElement | null = null
let componentLabel: HTMLDivElement | null = null
let promptBar: HTMLDivElement | null = null
let promptInput: HTMLTextAreaElement | null = null
let selHighlights: HTMLDivElement[] = []     // Tailwind multi-select outline pool

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function urlMatches(pageUrl: string): boolean {
  try {
    // Match by pathname only — the same app is served on localhost, the tunnel,
    // and beta deploys (different origins, same paths). Origin is intentionally ignored.
    return new URL(pageUrl).pathname === window.location.pathname
  } catch {
    return false
  }
}

function checkFingerprint(
  el: Element,
  fp: import('../shared/comments').ReviewComment['fingerprint'],
): boolean {
  if (!fp) return true
  if (el.tagName.toLowerCase() !== fp.tagName) return false
  if (fp.identifyingAttrs) {
    for (const [attr, val] of Object.entries(fp.identifyingAttrs)) {
      if (el.getAttribute(attr) !== val) return false
    }
  }
  if (fp.textSnippet) {
    const current = el.textContent?.trim().slice(0, 40) ?? ''
    if (current !== fp.textSnippet) return false
  }
  return true
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  if (document.getElementById('patchly-root')) return

  root = document.createElement('div')
  root.id = 'patchly-root'
  document.body.appendChild(root)

  selectionRect = document.createElement('div')
  selectionRect.id = 'patchly-selection-rect'
  document.body.appendChild(selectionRect)

  elementHighlight = document.createElement('div')
  elementHighlight.id = 'patchly-element-highlight'
  document.body.appendChild(elementHighlight)

  componentLabel = document.createElement('div')
  componentLabel.id = 'patchly-component-label'
  document.body.appendChild(componentLabel)

  buildToolbar()

  promptBar = document.createElement('div')
  promptBar.id = 'patchly-prompt-bar'
  promptBar.innerHTML = `
    <textarea id="patchly-prompt-input" rows="1" placeholder="Describe what to change…" autocomplete="off"></textarea>
    <button id="patchly-prompt-submit">Apply</button>
    <button id="patchly-prompt-cancel" title="Dismiss">×</button>
  `
  document.body.appendChild(promptBar)

  promptInput = document.getElementById('patchly-prompt-input') as HTMLTextAreaElement
  document.getElementById('patchly-prompt-submit')!.addEventListener('click', submitPrompt)
  document.getElementById('patchly-prompt-cancel')!.addEventListener('click', dismissSelection)

  promptInput.addEventListener('input', autoGrowPrompt)
  promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPrompt() }
    if (e.key === 'Escape') dismissSelection()
  })

  root.addEventListener('mousedown', onMouseDown)
  root.addEventListener('mousemove', onMouseMove)
  root.addEventListener('mouseup', onMouseUp)

  initClassPanel()
  initCommentComposer()
  initPinsLayer()
}

// ─── Floating toolbar ────────────────────────────────────────────────────────

function buildToolbar(): void {
  toolbar = document.createElement('div')
  toolbar.id = 'patchly-toolbar'
  toolbar.innerHTML = `
    <div class="patchly-tb-tabs">
      <button class="patchly-tb-tab active" data-mode="ai">AI Mode</button>
      <button class="patchly-tb-tab" data-mode="tailwind">Tailwind Mode</button>
      <button class="patchly-tb-tab" data-mode="comment">Comment</button>
    </div>
    <span class="patchly-tb-sep"></span>
    <button class="patchly-tb-undo" title="Undo">↶</button>
    <button class="patchly-tb-redo" title="Redo">↷</button>
    <span class="patchly-tb-identity" style="display:none"></span>
    <span class="patchly-tb-sep"></span>
    <button class="patchly-tb-settings" title="Settings">⚙</button>
    <span class="patchly-tb-dot" title="Agent status"></span>
    <button class="patchly-tb-close" title="Exit editing (Esc)">×</button>
    <div class="patchly-tb-settings-pop" style="display:none">
      <label class="patchly-tb-set-row">
        <span>Auto-apply trusted edits</span>
        <input type="checkbox" id="patchly-set-autoapply" />
      </label>
      <label class="patchly-tb-set-row">
        <span>Confidence threshold</span>
        <select id="patchly-set-threshold">
          <option value="0.7">70%</option>
          <option value="0.8">80%</option>
          <option value="0.9">90%</option>
          <option value="0.95">95%</option>
        </select>
      </label>
    </div>
  `
  document.body.appendChild(toolbar)

  toolbar.querySelectorAll<HTMLButtonElement>('.patchly-tb-tab').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.getAttribute('data-mode') as 'ai' | 'tailwind' | 'comment'))
  })
  ;(toolbar.querySelector('.patchly-tb-undo') as HTMLButtonElement).addEventListener('click', onUndo)
  ;(toolbar.querySelector('.patchly-tb-redo') as HTMLButtonElement).addEventListener('click', onRedo)
  ;(toolbar.querySelector('.patchly-tb-close') as HTMLButtonElement).addEventListener('click', exitEditing)
  ;(toolbar.querySelector('.patchly-tb-settings') as HTMLButtonElement).addEventListener('click', toggleSettings)

  // Settings popover wiring (same chrome.storage.local keys the preview reads).
  const autoEl = toolbar.querySelector('#patchly-set-autoapply') as HTMLInputElement
  const thrEl = toolbar.querySelector('#patchly-set-threshold') as HTMLSelectElement
  try {
    chrome.storage.local.get({ autoApply: false, confidenceThreshold: 0.9 }, (s) => {
      const v = s as { autoApply: boolean; confidenceThreshold: number }
      autoEl.checked = !!v.autoApply
      thrEl.value = String(v.confidenceThreshold)
      thrEl.disabled = !v.autoApply
    })
  } catch { /* storage unavailable */ }
  autoEl.addEventListener('change', () => {
    chrome.storage.local.set({ autoApply: autoEl.checked })
    thrEl.disabled = !autoEl.checked
  })
  thrEl.addEventListener('change', () => {
    chrome.storage.local.set({ confidenceThreshold: parseFloat(thrEl.value) })
  })
}

function toggleSettings(): void {
  const pop = toolbar?.querySelector('.patchly-tb-settings-pop') as HTMLElement | null
  if (pop) pop.style.display = pop.style.display === 'none' ? 'block' : 'none'
}

// Refresh tab active state + undo/redo availability for the current mode.
function updateToolbar(): void {
  if (!toolbar) return
  toolbar.querySelectorAll<HTMLButtonElement>('.patchly-tb-tab').forEach((t) => {
    t.classList.toggle('active', t.getAttribute('data-mode') === activeMode)
  })
  const undoBtn = toolbar.querySelector('.patchly-tb-undo') as HTMLButtonElement
  const redoBtn = toolbar.querySelector('.patchly-tb-redo') as HTMLButtonElement
  if (activeMode === 'ai') {
    // AI is undo-only; redo is hidden.
    undoBtn.style.display = ''
    undoBtn.disabled = false
    redoBtn.style.display = 'none'
  } else if (activeMode === 'comment') {
    // Comment mode has no undo/redo.
    undoBtn.style.display = 'none'
    redoBtn.style.display = 'none'
  } else {
    undoBtn.style.display = ''
    redoBtn.style.display = ''
    undoBtn.disabled = !classCanUndo()
    redoBtn.disabled = !classCanRedo()
  }
}

function setConnectedDot(connected: boolean): void {
  const dot = toolbar?.querySelector('.patchly-tb-dot') as HTMLElement | null
  if (dot) dot.classList.toggle('connected', connected)
}

// ─── Cloud identity (Phase D2) ───────────────────────────────────────────────
let currentIdentity: { userId: string; name: string; image?: string } | null = null

// Toolbar identity chip — only in comment mode + cloud mode. Signed-in member
// shows avatar+name+sign-out; otherwise a "Sign in with GitHub" button.
function updateIdentityChip(): void {
  const chip = toolbar?.querySelector('.patchly-tb-identity') as HTMLElement | null
  if (!chip) return
  const cloudApiUrl = window.__patchlyGetCloudApiUrl?.() ?? null
  if (activeMode !== 'comment' || !cloudApiUrl) { chip.style.display = 'none'; return }

  chip.style.cssText = 'display:flex;align-items:center;gap:6px;'
  chip.textContent = ''  // clear; only controlled nodes appended below

  if (currentIdentity) {
    if (currentIdentity.image) {
      const av = document.createElement('img')
      av.src = currentIdentity.image; av.alt = ''
      av.style.cssText = 'width:18px;height:18px;border-radius:50%;'
      chip.appendChild(av)
    }
    const name = document.createElement('span')
    name.textContent = currentIdentity.name  // textContent — never innerHTML
    name.style.cssText = 'font-size:12px;'
    const out = document.createElement('button')
    out.textContent = 'Sign out'
    out.style.cssText = 'background:none;border:none;color:#a0a0c0;font-size:11px;cursor:pointer;'
    out.addEventListener('click', () => window.__patchlySignOut?.())
    chip.append(name, out)
  } else {
    const btn = document.createElement('button')
    btn.textContent = 'Sign in with GitHub'
    btn.style.cssText = 'background:#24292e;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;'
    btn.addEventListener('click', () => {
      const url = window.__patchlyGetCloudApiUrl?.()
      const pid = window.__patchlyGetCloudProjectId?.()
      if (url && pid) window.open(`${url}/extension-auth?projectId=${encodeURIComponent(pid)}`, '_blank')
    })
    chip.appendChild(btn)
  }
}

window.__patchlyOnIdentity = (identity): void => {
  currentIdentity = identity
  updateIdentityChip()
  // Force a second update after a tick — storage-change event sometimes races
  // with the auth tab closing, so the chip may render before identity is settled.
  setTimeout(updateIdentityChip, 100)
}

function onUndo(): void {
  if (activeMode === 'ai') {
    window.__patchlySendToAgent?.({ type: 'PATCHLY_UNDO' })
  } else {
    classUndo()
  }
}
function onRedo(): void {
  if (activeMode === 'tailwind') classRedo()
}

// ─── Editing-mode lifecycle ──────────────────────────────────────────────────

function toggle(): void {
  if (isActive) exitEditing()
  else activate()
}

function activate(): void {
  if (isActive) return
  isActive = true
  init()
  root?.classList.add('active', `mode-${activeMode}`)
  if (toolbar) toolbar.style.display = 'flex'
  setConnectedDot(window.__patchlyIsConnected?.() ?? false)
  updateToolbar()
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
  requestCommentList()
}

function exitEditing(): void {
  isActive = false
  mouseDown = false
  isDragging = false
  clearSelectionState()

  root?.classList.remove('active')
  if (toolbar) toolbar.style.display = 'none'
  if (selectionRect) selectionRect.style.display = 'none'
  if (elementHighlight) elementHighlight.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'
  if (promptBar) promptBar.style.display = 'none'
  if (promptInput) promptInput.value = ''
  hidePicker()
  hideClassPanel()
  clearSelHighlights()
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
}

function clearSelectionState(): void {
  selectedElement = null
  selectedPatchlySrc = null
  selectedTargets = null
  selectedSet = []
  pendingInspectSessionId = null
  window.__patchlySelectionUpdate?.([])
}

// Esc / dismiss → drop the current selection but stay in editing mode.
function dismissSelection(): void {
  selectedElement = null
  selectedPatchlySrc = null
  selectedTargets = null
  window.__patchlySelectionUpdate?.([])
  if (promptBar) promptBar.style.display = 'none'
  if (promptInput) promptInput.value = ''
  if (elementHighlight) elementHighlight.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'
}

function onViewportChange(): void {
  if (isActive && activeMode === 'tailwind') renderSelHighlights()
}

// ─── Modes ───────────────────────────────────────────────────────────────────

function setMode(mode: 'ai' | 'tailwind' | 'comment'): void {
  // Cleanup when leaving comment mode.
  if (activeMode === 'comment') {
    hideCommentComposer()
  }

  activeMode = mode
  root?.classList.remove('mode-ai', 'mode-tailwind', 'mode-comment')
  root?.classList.add(`mode-${mode}`)
  updateToolbar()
  updateIdentityChip()

  // Clear any in-flight selection visuals when switching models.
  if (promptBar) promptBar.style.display = 'none'
  if (selectionRect) selectionRect.style.display = 'none'
  hidePicker()

  if (mode === 'ai') {
    hideClassPanel()
    clearSelHighlights()
    selectedSet = []
  } else if (mode === 'comment') {
    // Mirror AI-mode teardown: hide class panel, clear selection state
    hideClassPanel()
    clearSelHighlights()
    selectedElement = null
    selectedPatchlySrc = null
    selectedTargets = null
    selectedSet = []
    if (promptBar) promptBar.style.display = 'none'
    if (promptInput) promptInput.value = ''
    if (elementHighlight) elementHighlight.style.display = 'none'
    if (componentLabel) componentLabel.style.display = 'none'
    // Load comments so pins can render
    requestCommentList()
  } else {
    // Tailwind gate is shown inside the class panel (renderPanel checks tailwindConfigured).
    // If something is already selected from AI, inspect it in the sidebar.
    if (selectedElement) {
      selectedSet = [selectedElement]
      selectedTargets = selectedSet
      renderSelHighlights()
      inspectCurrentSelection()
    }
  }
}

function requestCommentList(): void {
  listCommentsSessionId = Math.random().toString(36).slice(2)
  window.__patchlyListComments?.(listCommentsSessionId, 'open')
}

function initPinsLayer(): void {
  pinsContainerEl = document.createElement('div')
  pinsContainerEl.id = 'patchly-pins'
  pinsContainerEl.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
  document.body.appendChild(pinsContainerEl)
  window.addEventListener('scroll', updatePinPositions, { passive: true })
  window.addEventListener('resize', updatePinPositions, { passive: true })
  window.addEventListener('popstate', buildPins)
  window.addEventListener('hashchange', buildPins)
}

function updateCommentBadge(): void {
  const tab = toolbar?.querySelector<HTMLButtonElement>('[data-mode="comment"]')
  if (!tab) return
  const openCount = cachedComments.filter(
    (c) => c.status === 'open' && urlMatches(c.pageUrl),
  ).length
  tab.textContent = openCount > 0 ? `Comment · ${openCount}` : 'Comment'
}

function buildPins(): void {
  if (!pinsContainerEl || !isActive) return
  closePinCard()
  pinsContainerEl.innerHTML = ''
  const openComments = cachedComments.filter(
    (c) => c.status === 'open' && urlMatches(c.pageUrl),
  )
  openComments.forEach((comment, i) => {
    const pin = document.createElement('div')
    pin.className = 'patchly-pin'
    pin.setAttribute('data-comment-id', comment.id)
    pin.textContent = String(i + 1)
    pin.style.cssText = `
      position:fixed;left:0;top:0;
      width:24px;height:24px;background:#7c3aed;color:#fff;
      border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:700;font-family:sans-serif;
      pointer-events:auto;cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff;
      z-index:2147483621;user-select:none;
    `
    pin.addEventListener('click', (e) => {
      e.stopPropagation()
      openPinCard(comment, i + 1)
    })
    pinsContainerEl!.appendChild(pin)
  })
  updatePinPositions()
  updateCommentBadge()
}

function updatePinPositions(): void {
  if (!pinsContainerEl || !isActive) return
  const openComments = cachedComments.filter(
    (c) => c.status === 'open' && urlMatches(c.pageUrl),
  )
  const pins = pinsContainerEl.querySelectorAll<HTMLElement>('.patchly-pin')
  pins.forEach((pin, i) => {
    const comment = openComments[i]
    if (!comment) { pin.style.display = 'none'; return }

    let anchorX: number | null = null
    let anchorY: number | null = null

    if (comment.kind === 'element' && comment.patchlySrc) {
      const el = document.querySelector(
        `[data-patchly-src="${CSS.escape(comment.patchlySrc)}"]`,
      )
      if (el) {
        const r = el.getBoundingClientRect()
        anchorX = r.left + r.width / 2
        anchorY = r.top
      }
    } else if (comment.kind === 'area' && comment.rect) {
      // rect stored in page coords; convert to current viewport
      anchorX = comment.rect.x - window.scrollX + comment.rect.w / 2
      anchorY = comment.rect.y - window.scrollY
    }

    if (anchorX !== null && anchorY !== null) {
      const inView = anchorX > 0 && anchorX < window.innerWidth &&
                     anchorY > -24 && anchorY < window.innerHeight + 24
      pin.style.left = `${anchorX - 12}px`
      pin.style.top  = `${anchorY - 12}px`
      pin.style.display = inView ? 'flex' : 'none'
    } else {
      pin.style.display = 'none'
    }
  })
}

let pinCardEl: HTMLDivElement | null = null
let pinCardKeyHandler: ((e: KeyboardEvent) => void) | null = null

function closePinCard(): void {
  pinCardEl?.remove()
  pinCardEl = null
  if (pinCardKeyHandler) {
    document.removeEventListener('keydown', pinCardKeyHandler, true)
    pinCardKeyHandler = null
  }
}

function openPinCard(
  comment: import('../shared/comments').ReviewComment,
  pinNumber: number,
): void {
  closePinCard()

  pinCardEl = document.createElement('div')
  pinCardEl.className = 'patchly-pin-card'
  pinCardEl.style.cssText = `
    position:fixed;z-index:2147483647;
    background:#1e1e2e;border:1px solid #3b3b5c;border-radius:8px;
    padding:12px;width:280px;
    box-shadow:0 4px 24px rgba(0,0,0,.5);
    font-family:sans-serif;font-size:13px;color:#e0e0f0;
    display:flex;flex-direction:column;gap:8px;
  `
  // Position near the pin
  const pinEl = pinsContainerEl?.querySelector(`[data-comment-id="${comment.id}"]`)
  if (pinEl) {
    const r = (pinEl as HTMLElement).getBoundingClientRect()
    const top = Math.min(r.bottom + 6, window.innerHeight - 200)
    const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - 296))
    pinCardEl.style.top = `${top}px`
    pinCardEl.style.left = `${left}px`
  }

  // Close button
  const closeBtn = document.createElement('button')
  closeBtn.textContent = '×'
  closeBtn.style.cssText =
    'position:absolute;top:6px;right:8px;background:none;border:none;color:#a0a0c0;font-size:16px;cursor:pointer;line-height:1;'
  closeBtn.addEventListener('click', closePinCard)

  // Pin number + meta header
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:6px;padding-right:20px;'
  const badge = document.createElement('span')
  badge.style.cssText =
    'background:#7c3aed;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;'
  badge.textContent = String(pinNumber)
  header.append(badge)
  if (comment.authorAvatar) {
    const av = document.createElement('img')
    av.src = comment.authorAvatar
    av.alt = ''
    av.style.cssText = 'width:16px;height:16px;border-radius:50%;flex-shrink:0;'
    header.append(av)
  }
  const metaText = document.createElement('span')
  metaText.style.cssText = 'color:#a0a0c0;font-size:11px;'
  metaText.textContent = [
    comment.author,
    comment.tag ? `<${comment.tag}>` : null,
    comment.componentName ?? null,
    new Date(comment.createdAt).toLocaleString(),
  ]
    .filter(Boolean)
    .join(' · ')
  header.append(metaText)

  // Note text — UNTRUSTED: textContent only, never innerHTML
  const noteEl = document.createElement('p')
  noteEl.style.cssText = 'margin:0;line-height:1.5;word-break:break-word;'
  noteEl.textContent = comment.note  // SECURITY: textContent, never innerHTML

  // Screenshot thumbnail
  let imgEl: HTMLImageElement | null = null
  if (comment.screenshot) {
    imgEl = document.createElement('img')
    imgEl.alt = ''
    imgEl.style.cssText =
      'width:100%;border-radius:4px;border:1px solid #3b3b5c;max-height:140px;object-fit:cover;'
    // Phase A: base64 string. Phase B: { url, key } from UploadThing CDN.
    if (typeof comment.screenshot === 'string') {
      imgEl.src = `data:image/png;base64,${comment.screenshot}`
    } else {
      imgEl.src = comment.screenshot.url
    }
  }

  // Fingerprint drift check
  const targetEl = comment.kind === 'element' && comment.patchlySrc
    ? document.querySelector(`[data-patchly-src="${CSS.escape(comment.patchlySrc)}"]`)
    : null
  const drifted = targetEl && comment.fingerprint
    ? !checkFingerprint(targetEl, comment.fingerprint)
    : false

  // Action buttons
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;'

  if (comment.status === 'open') {
    const fixAIBtn = document.createElement('button')
    fixAIBtn.textContent = 'Fix with AI'
    fixAIBtn.style.cssText =
      'padding:4px 10px;border-radius:4px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;font-weight:600;'
    fixAIBtn.addEventListener('click', () => fixWithAI(comment))

    const editClassBtn = document.createElement('button')
    editClassBtn.textContent = 'Edit classes'
    editClassBtn.style.cssText =
      'padding:4px 10px;border-radius:4px;border:1px solid #3b3b5c;background:transparent;color:#e0e0f0;cursor:pointer;font-size:12px;'
    editClassBtn.addEventListener('click', () => editClasses(comment))

    const resolveBtn = document.createElement('button')
    resolveBtn.textContent = 'Resolve'
    resolveBtn.style.cssText =
      'padding:4px 10px;border-radius:4px;border:1px solid #3b3b5c;background:transparent;color:#a0a0c0;cursor:pointer;font-size:12px;'
    resolveBtn.addEventListener('click', () => resolveComment(comment.id, 'dev'))

    actions.append(fixAIBtn, editClassBtn, resolveBtn)
  } else {
    const resolvedLabel = document.createElement('span')
    resolvedLabel.style.cssText = 'color:#4ade80;font-size:12px;'
    resolvedLabel.textContent = '✓ Resolved'
    actions.appendChild(resolvedLabel)
  }

  pinCardEl.append(closeBtn, header, noteEl)
  if (imgEl) pinCardEl.appendChild(imgEl)

  if (drifted) {
    const driftWarning = document.createElement('div')
    driftWarning.style.cssText =
      'color:#f59e0b;font-size:11px;padding:4px 6px;background:#2a2010;border-radius:4px;'
    driftWarning.textContent = '⚠ Element may have changed since this comment was left'
    pinCardEl.appendChild(driftWarning)
  }

  pinCardEl.appendChild(actions)

  if (comment.status === 'open') {
    const hints = document.createElement('div')
    hints.style.cssText = 'color:#555577;font-size:10px;margin-top:2px;'
    hints.textContent = 'A · Fix with AI  T · Tailwind  R · Resolve  Esc · Close'
    pinCardEl.appendChild(hints)
  }

  pinCardEl.addEventListener('mousedown', (e) => e.stopPropagation())
  document.body.appendChild(pinCardEl)

  if (comment.status === 'open') {
    pinCardKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closePinCard() }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); fixWithAI(comment) }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); editClasses(comment) }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); resolveComment(comment.id, 'dev') }
    }
    document.addEventListener('keydown', pinCardKeyHandler, true)
  }
}

function fixWithAI(comment: import('../shared/comments').ReviewComment): void {
  closePinCard()
  setMode('ai')
  if (comment.patchlySrc) {
    const el = document.querySelector(
      `[data-patchly-src="${CSS.escape(comment.patchlySrc)}"]`,
    ) as HTMLElement | null
    if (el) selectElement(el, el.getBoundingClientRect())
  }
  // Pre-fill prompt with note as plain text — dev reads and confirms before sending
  if (promptInput) {
    promptInput.value = comment.note  // plain text assignment, never DOM injection
    autoGrowPrompt()
    setTimeout(() => promptInput?.focus(), 50)
  }
}

function editClasses(comment: import('../shared/comments').ReviewComment): void {
  closePinCard()
  setMode('tailwind')
  if (comment.patchlySrc) {
    const el = document.querySelector(
      `[data-patchly-src="${CSS.escape(comment.patchlySrc)}"]`,
    ) as HTMLElement | null
    if (el) {
      selectedSet = [el]
      inspectCurrentSelection()
    }
  }
}

function resolveComment(id: string, _resolvedBy: 'dev' | 'agent'): void {
  closePinCard()
  window.__patchlyDeleteComment?.(id)
  // Optimistic delete — COMMENT_DELETED broadcast also triggers __patchlyOnCommentDeleted
  cachedComments = cachedComments.filter((c) => c.id !== id)
  buildPins()
}

function currentSelectionSrcs(): string[] {
  if (selectedTargets && selectedTargets.length) {
    return selectedTargets
      .map((el) => (el as HTMLElement).dataset.patchlySrc)
      .filter((s): s is string => Boolean(s))
  }
  if (selectedPatchlySrc) return [selectedPatchlySrc]
  return []
}

function inspectCurrentSelection(): void {
  const srcs = currentSelectionSrcs()
  if (!srcs.length) { hideClassPanel(); return }
  pendingInspectSessionId = Math.random().toString(36).slice(2)
  window.__patchlyInspect?.(srcs, pendingInspectSessionId)
}

// ─── Mouse handling ──────────────────────────────────────────────────────────

function onMouseDown(e: MouseEvent): void {
  if (commentComposerEl && commentComposerEl.contains(e.target as Node)) return
  if (!isActive) return
  e.preventDefault()
  mouseDown = true
  isDragging = false
  startX = currentX = e.clientX
  startY = currentY = e.clientY
  // Dismiss transient UI; keep the toolbar.
  if (promptBar) promptBar.style.display = 'none'
  hidePicker()
}

function onMouseMove(e: MouseEvent): void {
  if (commentComposerEl && commentComposerEl.contains(e.target as Node)) return
  if (!isActive) return
  currentX = e.clientX
  currentY = e.clientY

  // AI/comment mode: a held drag past the threshold becomes an area box.
  if (mouseDown && (activeMode === 'ai' || activeMode === 'comment')) {
    const moved = Math.abs(currentX - startX) > DRAG_THRESHOLD || Math.abs(currentY - startY) > DRAG_THRESHOLD
    if (moved) {
      isDragging = true
      updateSelectionRect()
      if (selectionRect) selectionRect.style.display = 'block'
      return
    }
  }

  if (!isDragging) hoverHighlight(e.clientX, e.clientY)
}

function onMouseUp(e: MouseEvent): void {
  if (!isActive || !mouseDown) return
  mouseDown = false
  currentX = e.clientX
  currentY = e.clientY

  if (activeMode === 'ai') {
    if (isDragging) {
      isDragging = false
      const rect = getSelectionRect()
      if (selectionRect) selectionRect.style.display = 'none'
      if (rect.width < DRAG_THRESHOLD && rect.height < DRAG_THRESHOLD) return
      findTargetElement(rect)
    } else {
      // Plain click → single element under cursor.
      const el = elementAtPoint(e.clientX, e.clientY)
      if (el) selectElement(el, pointRect(e.clientX, e.clientY))
    }
    return
  }

  if (activeMode === 'comment' && !isDragging) {
    // Ignore clicks that land inside the composer itself; a click on any other
    // page element re-targets the composer to the newly clicked element.
    if (commentComposerEl && commentComposerEl.contains(e.target as Node)) return
    const el = elementAtPoint(e.clientX, e.clientY)
    if (!el) return
    const rect = el.getBoundingClientRect()
    commentPendingEl = el
    commentPendingPatchlySrc = (el as HTMLElement).dataset.patchlySrc ?? null
    commentPendingReactInfo = getReactInfo(el)
    commentPendingScreenshot = null
    captureElementScreenshot(el).then((shot) => {
      commentPendingScreenshot = shot ?? null
      showCommentComposer({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, 'element')
    }).catch(() => {
      showCommentComposer({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, 'element')
    })
    return
  }

  if (activeMode === 'comment' && isDragging) {
    if (commentComposerEl && commentComposerEl.contains(e.target as Node)) return
    const selRect = getSelectionRect()
    if (selectionRect) selectionRect.style.display = 'none'
    isDragging = false
    if (selRect.width < 5 || selRect.height < 5) return
    commentAreaRect = {
      x: selRect.x + window.scrollX,
      y: selRect.y + window.scrollY,
      w: selRect.width,
      h: selRect.height,
    }
    commentPendingEl = null
    commentPendingPatchlySrc = null
    commentPendingReactInfo = null
    captureElementScreenshot(document.body).then((shot) => {
      commentPendingScreenshot = shot ?? null
    })
    showCommentComposer({ x: selRect.x, y: selRect.y, width: selRect.width, height: selRect.height }, 'area')
    return
  }

  // Tailwind mode: click = single, Ctrl/Cmd+Click = toggle into multi-select.
  isDragging = false
  const el = elementAtPoint(e.clientX, e.clientY)
  if (el) tailwindSelect(el, e.ctrlKey || e.metaKey)
}

// Nearest [data-patchly-src] under the cursor (skipping our own UI).
function elementAtPoint(x: number, y: number): Element | null {
  const stack = document.elementsFromPoint(x, y)
  for (const el of stack) {
    if (el.id && el.id.startsWith('patchly-')) continue
    if (el.closest('[id^="patchly-"]')) continue
    const match = el.closest('[data-patchly-src]')
    if (match) return match
  }
  return null
}

function pointRect(x: number, y: number): SelectionRect {
  return { x, y, width: 0, height: 0 }
}

// Live hover outline (both modes, before/over selection).
function hoverHighlight(x: number, y: number): void {
  // In AI mode, stop hovering once the prompt bar is showing for a selection.
  if (activeMode === 'ai' && promptBar && promptBar.style.display !== 'none') return
  const el = elementAtPoint(x, y)
  if (!el || !elementHighlight) {
    if (elementHighlight) elementHighlight.style.display = 'none'
    if (componentLabel) componentLabel.style.display = 'none'
    return
  }
  const r = el.getBoundingClientRect()
  positionBox(elementHighlight, r)
  elementHighlight.style.display = 'block'
  const src = (el as HTMLElement).dataset.patchlySrc
  if (componentLabel) {
    componentLabel.textContent = src ? (src.split(':')[0].split('/').pop() ?? '') : el.tagName.toLowerCase()
    componentLabel.style.left = r.left + 'px'
    componentLabel.style.top = (r.top - 22) + 'px'
    componentLabel.style.display = 'block'
  }
}

function positionBox(box: HTMLElement, r: DOMRect | SelectionRect): void {
  const left = 'left' in r ? r.left : r.x
  const top = 'top' in r ? r.top : r.y
  box.style.left = left + 'px'
  box.style.top = top + 'px'
  box.style.width = r.width + 'px'
  box.style.height = r.height + 'px'
}

function updateSelectionRect(): void {
  if (selectionRect) positionBox(selectionRect, getSelectionRect())
}

function getSelectionRect(): SelectionRect {
  return {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  }
}

// ─── AI area selection (drag box → candidates / picker) ──────────────────────

function findTargetElement(rect: SelectionRect): void {
  const srcCandidates = gatherSrcCandidates(rect)
  if (srcCandidates.length > 1) { showComponentPicker(rect, srcCandidates); return }

  let el: Element | null
  if (srcCandidates.length === 1) el = srcCandidates[0].el
  else el = pickByCenter(rect)

  if (!el) { dismissSelection(); return }
  selectElement(el, rect)
}

function overlapArea(rect: SelectionRect, elRect: DOMRect): number {
  const ox = Math.max(0, Math.min(rect.x + rect.width, elRect.right) - Math.max(rect.x, elRect.left))
  const oy = Math.max(0, Math.min(rect.y + rect.height, elRect.bottom) - Math.max(rect.y, elRect.top))
  return ox * oy
}

function gatherSrcCandidates(rect: SelectionRect): SrcCandidate[] {
  const found: SrcCandidate[] = []
  const seen = new Set<string>()
  document.querySelectorAll('[data-patchly-src]').forEach((el) => {
    if (el.id && el.id.startsWith('patchly-')) return
    const elRect = el.getBoundingClientRect()
    const elArea = elRect.width * elRect.height
    if (elArea <= 0) return
    const overlap = overlapArea(rect, elRect)
    if (overlap <= 0) return
    if (overlap / elArea < 0.5) return
    const src = (el as HTMLElement).dataset.patchlySrc!
    if (seen.has(src)) return
    seen.add(src)
    found.push({ el, src, area: elArea })
  })
  const outermost = found.filter((c) => !found.some((o) => o !== c && o.el.contains(c.el)))
  outermost.sort((a, b) => b.area - a.area)
  return outermost
}

function pickByCenter(rect: SelectionRect): Element | null {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  return elementAtPoint(centerX, centerY)
}

// ─── AI single/batch selection ───────────────────────────────────────────────

function selectElement(el: Element, rect: SelectionRect): void {
  selectedElement = el
  selectedTargets = null
  selectedSet = []
  selectedPatchlySrc = (el as HTMLElement).dataset.patchlySrc ?? null

  if (selectedPatchlySrc) pushSelectionPerception(el, selectedPatchlySrc)

  const elRect = el.getBoundingClientRect()
  if (elementHighlight) { positionBox(elementHighlight, elRect); elementHighlight.style.display = 'block' }

  const fileName = selectedPatchlySrc ? selectedPatchlySrc.split(':')[0].split('/').pop() : el.tagName.toLowerCase()
  if (componentLabel) {
    componentLabel.textContent = fileName ?? ''
    componentLabel.style.left = elRect.left + 'px'
    componentLabel.style.top = (elRect.top - 22) + 'px'
    componentLabel.style.display = 'block'
  }

  openPromptBar(rect)
}

function openPromptBar(rect: SelectionRect): void {
  const promptY = Math.min(rect.y + rect.height + 8, window.innerHeight - 80)
  if (promptBar) {
    promptBar.style.left = Math.max(8, Math.min(rect.x, window.innerWidth - 360)) + 'px'
    promptBar.style.top = promptY + 'px'
    promptBar.style.display = 'flex'
  }
  if (promptInput) { promptInput.value = ''; autoGrowPrompt() }
  setTimeout(() => promptInput?.focus(), 50)
}

function autoGrowPrompt(): void {
  if (!promptInput) return
  promptInput.style.height = 'auto'
  promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px'
}

// ─── Tailwind multi-select ───────────────────────────────────────────────────

function tailwindSelect(el: Element, additive: boolean): void {
  if (!additive) {
    selectedSet = [el]
  } else if (selectedSet.includes(el)) {
    selectedSet = selectedSet.filter((x) => x !== el)
  } else {
    selectedSet = [...selectedSet, el]
  }
  selectedElement = selectedSet[0] ?? null
  selectedPatchlySrc = null
  selectedTargets = selectedSet.length ? selectedSet : null
  renderSelHighlights()

  window.__patchlySelectionUpdate?.(
    selectedSet
      .filter((e) => (e as HTMLElement).dataset.patchlySrc)
      .map((e) => ({
        patchlySrc: (e as HTMLElement).dataset.patchlySrc!,
        tag: e.tagName.toLowerCase(),
        classes: (e as HTMLElement).className || '',
      })),
  )

  if (selectedSet.length) inspectCurrentSelection()
  else hideClassPanel()
}

function renderSelHighlights(): void {
  while (selHighlights.length < selectedSet.length) {
    const d = document.createElement('div')
    d.className = 'patchly-sel-highlight'
    document.body.appendChild(d)
    selHighlights.push(d)
  }
  selHighlights.forEach((d, i) => {
    const el = selectedSet[i]
    if (!el) { d.style.display = 'none'; return }
    positionBox(d, el.getBoundingClientRect())
    d.style.display = 'block'
  })
}

function clearSelHighlights(): void {
  selHighlights.forEach((d) => (d.style.display = 'none'))
}

// ─── AI component picker (from area drag) ────────────────────────────────────

function showComponentPicker(rect: SelectionRect, candidates: SrcCandidate[]): void {
  let picker = document.getElementById('patchly-picker') as HTMLDivElement | null
  if (!picker) {
    picker = document.createElement('div')
    picker.id = 'patchly-picker'
    document.body.appendChild(picker)
  }

  const rows = candidates
    .map((c, i) => {
      const tag = c.el.tagName.toLowerCase()
      const srcParts = c.src.split(':')
      const fileLabel = `${srcParts[0].split('/').pop()}:${srcParts[1] ?? '?'}`
      const text = (c.el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48) || '(no text)'
      return `
        <div class="patchly-picker-row" data-idx="${i}">
          <input type="checkbox" class="patchly-picker-check" data-idx="${i}" />
          <span class="patchly-picker-tag">${tag}</span>
          <span class="patchly-picker-main">
            <span class="patchly-picker-file">${fileLabel}</span>
            <span class="patchly-picker-text">${escapeHtml(text)}</span>
          </span>
        </div>
      `
    })
    .join('')

  picker.innerHTML = `
    <div class="patchly-picker-head">Which component? <span class="patchly-picker-hint">click one, or check several</span></div>
    ${rows}
    <div class="patchly-picker-foot" style="display:none">
      <button class="patchly-picker-apply">Edit <span class="patchly-picker-count">0</span> selected</button>
    </div>
  `

  const px = Math.min(rect.x, window.innerWidth - 380)
  const py = Math.min(rect.y + 4, window.innerHeight - 340)
  picker.style.left = Math.max(8, px) + 'px'
  picker.style.top = Math.max(8, py) + 'px'
  picker.style.display = 'block'

  const foot = picker.querySelector('.patchly-picker-foot') as HTMLElement
  const countEl = picker.querySelector('.patchly-picker-count')!
  const checked = (): SrcCandidate[] =>
    [...picker!.querySelectorAll<HTMLInputElement>('.patchly-picker-check:checked')]
      .map((cb) => candidates[Number(cb.getAttribute('data-idx'))])
      .filter(Boolean)

  const refreshFoot = (): void => {
    const n = picker!.querySelectorAll('.patchly-picker-check:checked').length
    countEl.textContent = String(n)
    foot.style.display = n > 0 ? 'flex' : 'none'
  }

  picker.querySelectorAll<HTMLInputElement>('.patchly-picker-check').forEach((cb) => {
    cb.addEventListener('click', (e) => e.stopPropagation())
    cb.addEventListener('change', refreshFoot)
  })

  picker.querySelectorAll<HTMLElement>('.patchly-picker-row').forEach((row) => {
    const c = candidates[Number(row.getAttribute('data-idx'))]
    row.addEventListener('mouseenter', () => {
      if (elementHighlight) { positionBox(elementHighlight, c.el.getBoundingClientRect()); elementHighlight.style.display = 'block' }
    })
    row.addEventListener('click', () => {
      hidePicker()
      selectElement(c.el, rect)
    })
  })

  picker.querySelector('.patchly-picker-apply')!.addEventListener('click', () => {
    const chosen = checked()
    if (chosen.length === 0) return
    hidePicker()
    if (chosen.length === 1) {
      selectElement(chosen[0].el, rect)
    } else {
      selectedTargets = chosen.map((c) => c.el)
      openPromptForTargets(rect, chosen)
    }
  })
}

function openPromptForTargets(rect: SelectionRect, candidates: SrcCandidate[]): void {
  selectedElement = candidates[0].el
  selectedPatchlySrc = null
  selectedSet = []
  if (elementHighlight) elementHighlight.style.display = 'none'
  if (componentLabel) {
    componentLabel.textContent = `${candidates.length} components`
    componentLabel.style.left = rect.x + 'px'
    componentLabel.style.top = Math.max(2, rect.y - 22) + 'px'
    componentLabel.style.display = 'block'
  }
  openPromptBar(rect)
}

function hidePicker(): void {
  const picker = document.getElementById('patchly-picker')
  if (picker) picker.style.display = 'none'
}

// ─── Screenshot + AI edit dispatch ───────────────────────────────────────────

// Walk the React fiber tree to extract the nearest component name + curated props.
// React 16+ stores a fiber on DOM nodes as __reactFiber$<hash>. We walk up to the
// nearest function component (max 20 hops) and curate props (max 20 keys, no
// functions/children/className) to stay token-cheap.
function getReactInfo(el: Element): import('../shared/protocol.js').ReactInfo | null {
  try {
    const fiberKey = Object.keys(el as unknown as Record<string, unknown>).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
    )
    if (!fiberKey) return null

    type Fiber = { type?: unknown; memoizedProps?: Record<string, unknown>; return?: Fiber }
    const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as Fiber | null
    if (!fiber) return null

    // Walk up to the nearest function component (skip host elements like 'div')
    let cur: Fiber | undefined = fiber
    let compFiber: Fiber | null = null
    for (let i = 0; i < 20 && cur; i++, cur = cur.return) {
      if (typeof cur.type === 'function') { compFiber = cur; break }
    }
    const componentName = compFiber
      ? ((compFiber.type as { displayName?: string; name?: string }).displayName ||
         (compFiber.type as { name?: string }).name ||
         null)
      : null

    const rawProps = fiber.memoizedProps ?? {}
    const props: Record<string, unknown> = {}
    let count = 0
    for (const [k, v] of Object.entries(rawProps)) {
      if (count >= 20) break
      if (k === 'children' || k === 'className' || typeof v === 'function') continue
      try { JSON.stringify(v); props[k] = v } catch { props[k] = '[unserializable]' }
      count++
    }

    return { componentName, props }
  } catch {
    return null
  }
}

// Curated getComputedStyle subset the coding agent actually reasons over. Full
// computed style is ~300 props — we keep ~24 visual/layout ones to stay token-cheap.
const PERCEPTION_STYLE_PROPS = [
  'display', 'position', 'color', 'backgroundColor', 'backgroundImage',
  'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textAlign',
  'padding', 'margin', 'borderWidth', 'borderColor', 'borderStyle', 'borderRadius',
  'width', 'height', 'flexDirection', 'alignItems', 'justifyContent', 'gap',
  'boxShadow', 'opacity',
] as const

function collectComputedStyles(el: Element): Record<string, string> {
  const cs = getComputedStyle(el as HTMLElement)
  const out: Record<string, string> = {}
  for (const prop of PERCEPTION_STYLE_PROPS) {
    const v = cs.getPropertyValue(
      // camelCase → kebab-case for getPropertyValue
      prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()),
    )
    if (v && v !== 'none' && v !== 'normal') out[prop] = v.trim()
  }
  return out
}

// MCP perception bridge: push the selected element to the agent cache in two
// stages so selection stays responsive — synchronous styles immediately, then
// the (async) screenshot once it resolves. Cache is last-write-wins on the agent.
async function pushSelectionPerception(el: Element, patchlySrc: string): Promise<void> {
  const base = {
    patchlySrc,
    tag: el.tagName.toLowerCase(),
    classes: (el as HTMLElement).className || '',
    computedStyles: collectComputedStyles(el),
    reactInfo: getReactInfo(el),
  }
  window.__patchlySelectionUpdate?.([base])

  const screenshot = await captureElementScreenshot(el)
  // Guard: if the user moved to another element while we captured, don't clobber.
  if (selectedElement === el && selectedPatchlySrc === patchlySrc) {
    window.__patchlySelectionUpdate?.([{ ...base, screenshot }])
  }
}

// MCP on-demand recapture: the coding agent calls patchly_screenshot() after an
// edit to visually verify the result. If a patchlySrc is given we find that element
// in the live DOM by its data-patchly-src — this survives HMR reloads (which reset
// the JS `selectedElement`) and the user clicking elsewhere. Otherwise we fall back
// to the currently selected element.
window.__patchlyHandleScreenshotRequest = async function(sessionId: string, patchlySrc?: string): Promise<void> {
  let target: Element | null = selectedElement
  if (patchlySrc) {
    // Match on dataset rather than a CSS selector — the value contains / : . which
    // would need escaping in querySelector.
    target = [...document.querySelectorAll('[data-patchly-src]')]
      .find((el) => (el as HTMLElement).dataset.patchlySrc === patchlySrc) ?? null
  }
  const screenshot = target ? await captureElementScreenshot(target) : null
  window.__patchlySendToAgent?.({ type: 'PATCHLY_SCREENSHOT_RESULT', sessionId, screenshot, patchlySrc })
}

async function captureElementScreenshot(element: Element): Promise<string | null> {
  try {
    const rect = element.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    const response = await new Promise<{ ok: boolean; dataUrl?: string; error?: string } | null>((resolve) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[Patchly] Screenshot:', chrome.runtime.lastError.message)
          resolve(null)
        } else {
          resolve(res as { ok: boolean; dataUrl?: string; error?: string })
        }
      })
    })

    if (!response?.ok || !response.dataUrl) {
      if (response?.error) console.warn('[Patchly] Screenshot failed:', response.error)
      return null
    }

    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = response.dataUrl!
    })

    const cropX = Math.round(rect.left * dpr)
    const cropY = Math.round(rect.top * dpr)
    const cropW = Math.max(1, Math.round(rect.width * dpr))
    const cropH = Math.max(1, Math.round(rect.height * dpr))

    const canvas = document.createElement('canvas')
    canvas.width = cropW
    canvas.height = cropH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    return canvas.toDataURL('image/png').replace('data:image/png;base64,', '')
  } catch (err) {
    console.warn('[Patchly] Screenshot exception:', err instanceof Error ? err.message : String(err))
    return null
  }
}

async function submitPrompt(): Promise<void> {
  if (!promptInput) return
  const prompt = promptInput.value.trim()
  if (!prompt) { promptInput.focus(); return }
  if (!selectedElement && !selectedTargets) return

  if (selectedTargets && selectedTargets.length > 1) {
    const targets = selectedTargets
      .filter((el) => (el as HTMLElement).dataset.patchlySrc)
      .map((el) => ({
        patchlySrc: (el as HTMLElement).dataset.patchlySrc,
        elementHtml: el.outerHTML.slice(0, 500),
        elementClasses: (el as HTMLElement).className || '',
        screenshot_base64: null,
      }))

    const payload = { prompt, sessionId: Math.random().toString(36).slice(2), targets }
    if (window.__patchlySend) {
      window.__patchlySend(payload as Record<string, unknown>)
      if (promptBar) promptBar.style.display = 'none'
      promptInput.value = ''
      if (componentLabel) componentLabel.style.display = 'none'
      showLoadingPanel()
    }
    return
  }

  if (selectedElement) await sendSingleEdit(selectedElement, selectedPatchlySrc, prompt)
}

async function sendSingleEdit(el: Element, patchlySrc: string | null, prompt: string): Promise<void> {
  if (selectionRect) selectionRect.style.display = 'none'
  if (elementHighlight) elementHighlight.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const screenshot_base64 = await captureElementScreenshot(el)

  const payload: Record<string, unknown> = {
    patchlySrc,
    elementHtml: el.outerHTML.slice(0, 500),
    elementClasses: (el as HTMLElement).className || '',
    elementTag: el.tagName.toLowerCase(),
    prompt,
    sessionId: Math.random().toString(36).slice(2),
    screenshot_base64,
  }

  if (window.__patchlySend) {
    window.__patchlySend(payload)
    if (promptBar) promptBar.style.display = 'none'
    if (promptInput) { promptInput.value = ''; promptInput.disabled = false }
    const submitBtn = document.getElementById('patchly-prompt-submit') as HTMLButtonElement | null
    if (submitBtn) { submitBtn.textContent = 'Apply'; submitBtn.disabled = false; submitBtn.style.background = '' }
    showLoadingPanel()
  }
}

function resetPromptBar(): void {
  const submitBtn = document.getElementById('patchly-prompt-submit') as HTMLButtonElement | null
  if (submitBtn) { submitBtn.textContent = 'Apply'; submitBtn.disabled = false; submitBtn.style.background = '' }
  if (promptInput) { promptInput.disabled = false; promptInput.value = '' }
  if (promptBar) promptBar.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'
}

// ─── Comment composer ────────────────────────────────────────────────────────

function initCommentComposer(): void {
  commentComposerEl = document.createElement('div')
  commentComposerEl.id = 'patchly-comment-composer'
  // Max z-index + appended after #patchly-root so it stacks ABOVE the full-screen
  // capture layer (which has pointer-events:all + cursor:crosshair). cursor:default
  // overrides the page-level crosshair while the pointer is over the composer.
  commentComposerEl.style.cssText = 'display:none;position:fixed;z-index:2147483647;cursor:default;flex-direction:column;gap:6px;background:#1e1e2e;border:1px solid #3b3b5c;border-radius:8px;padding:12px;width:300px;box-shadow:0 4px 24px rgba(0,0,0,.4);'
  commentComposerEl.innerHTML = `
    <textarea id="patchly-cc-note" rows="3" placeholder="Describe the change needed…" style="resize:vertical;width:100%;box-sizing:border-box;background:#2a2a3e;color:#e0e0f0;border:1px solid #3b3b5c;border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;"></textarea>
    <input id="patchly-cc-author" type="text" placeholder="Your name (optional)" style="background:#2a2a3e;color:#e0e0f0;border:1px solid #3b3b5c;border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;" />
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="patchly-cc-cancel" style="padding:4px 12px;border-radius:4px;border:1px solid #3b3b5c;background:transparent;color:#a0a0c0;cursor:pointer;font-size:13px;">Cancel</button>
      <button id="patchly-cc-submit" style="padding:4px 12px;border-radius:4px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Add Comment</button>
    </div>
  `
  document.body.appendChild(commentComposerEl)
  document.getElementById('patchly-cc-submit')!.addEventListener('click', submitComment)
  document.getElementById('patchly-cc-cancel')!.addEventListener('click', hideCommentComposer)
  // Stop clicks inside composer from triggering overlay selection
  commentComposerEl.addEventListener('mousedown', (e) => e.stopPropagation())
}

function showCommentComposer(
  rect: { x: number; y: number; width?: number; height?: number },
  _kind: 'element' | 'area',
): void {
  if (!commentComposerEl) return
  const top = Math.min(rect.y + (rect.height ?? 0) + 8, window.innerHeight - 200)
  const left = Math.max(8, Math.min(rect.x, window.innerWidth - 316))
  commentComposerEl.style.top = `${top}px`
  commentComposerEl.style.left = `${left}px`
  commentComposerEl.style.display = 'flex'
  const noteEl = document.getElementById('patchly-cc-note') as HTMLTextAreaElement
  const authorEl = document.getElementById('patchly-cc-author') as HTMLInputElement
  noteEl.value = ''
  if (currentIdentity) {
    // Signed-in member — identity comes from the verified token; hide the name field.
    authorEl.value = currentIdentity.name
    authorEl.style.display = 'none'
  } else {
    authorEl.value = ''
    authorEl.style.display = ''
  }
  setTimeout(() => noteEl.focus(), 50)
}

function hideCommentComposer(): void {
  if (commentComposerEl) commentComposerEl.style.display = 'none'
  commentPendingEl = null
  commentPendingPatchlySrc = null
  commentPendingScreenshot = null
  commentPendingReactInfo = null
  commentAreaRect = null
}

function buildCommentFingerprint(el: Element): import('../shared/comments').ReviewComment['fingerprint'] {
  const attrs: Record<string, string> = {}
  if ((el as HTMLElement).id) attrs['id'] = (el as HTMLElement).id
  const testid = el.getAttribute('data-testid')
  if (testid) attrs['data-testid'] = testid
  return {
    tagName: el.tagName.toLowerCase(),
    identifyingAttrs: Object.keys(attrs).length ? attrs : undefined,
    textSnippet: el.textContent?.trim().slice(0, 40) || undefined,
  }
}

function submitComment(): void {
  const noteEl = document.getElementById('patchly-cc-note') as HTMLTextAreaElement
  const authorEl = document.getElementById('patchly-cc-author') as HTMLInputElement
  const note = noteEl.value.trim()
  if (!note) { noteEl.focus(); return }
  const author = authorEl.value.trim() || undefined

  type CommentData = Omit<import('../shared/comments').ReviewComment, 'id' | 'createdAt' | 'status'>
  const data: CommentData = commentPendingPatchlySrc
    ? {
        kind: 'element' as const,
        patchlySrc: commentPendingPatchlySrc,
        tag: commentPendingEl?.tagName.toLowerCase(),
        componentName: commentPendingReactInfo?.componentName ?? null,
        fingerprint: commentPendingEl ? buildCommentFingerprint(commentPendingEl) : undefined,
        pageUrl: window.location.href,
        note,   // plain text — rendered via textContent elsewhere, never innerHTML
        author,
        screenshot: commentPendingScreenshot ?? undefined,
      }
    : {
        kind: 'area' as const,
        rect: commentAreaRect ?? undefined,
        pageUrl: window.location.href,
        note,
        author,
        screenshot: commentPendingScreenshot ?? undefined,
      }

  window.__patchlyAddComment?.(data)
  hideCommentComposer()
}

// ─── Comments sidebar ────────────────────────────────────────────────────────
// Sidebar removed — pins layer is sufficient for discovery.

// ─── Globals (content → overlay) ─────────────────────────────────────────────
window.__patchlyResetPromptBar = resetPromptBar
window.__patchlyActivate = activate
window.__patchlyToggle = toggle
window.__patchlyCancel = exitEditing
window.__patchlySetConnected = setConnectedDot
window.__patchlyHistoryChanged = updateToolbar

// Comment mode inbound handlers
window.__patchlyOnCommentAdded = (comment) => {
  if (!cachedComments.find((c) => c.id === comment.id)) {
    cachedComments = [...cachedComments, comment]
  }
  buildPins()
}
window.__patchlyOnComments = (sessionId, comments) => {
  if (sessionId !== listCommentsSessionId) return
  listCommentsSessionId = null
  cachedComments = comments
  buildPins()
}
window.__patchlyOnCommentResolved = (id) => {
  // Comment is marked resolved (still in JSON); remove from open-comments cache
  cachedComments = cachedComments.filter((c) => c.id !== id)
  buildPins()
}
window.__patchlyOnCommentDeleted = (id) => {
  cachedComments = cachedComments.filter((c) => c.id !== id)
  buildPins()
}
window.__patchlyOnCommentsCleared = () => {
  // COMMENTS_CLEARED only fires for resolved comments, which aren't in cachedComments
  // (extension cache only holds open ones), so no cache update needed — just rebuild.
  buildPins()
}

// ─── Diff / preview rendering ────────────────────────────────────────────────

function renderDiff(diff: string): string {
  return (diff || '')
    .split('\n')
    .map((line) => {
      let cls = 'patchly-diff-ctx'
      if (line.startsWith('@@')) cls = 'patchly-diff-hunk'
      else if (line.startsWith('+++') || line.startsWith('---')) cls = 'patchly-diff-ctx'
      else if (line.startsWith('+')) cls = 'patchly-diff-add'
      else if (line.startsWith('-')) cls = 'patchly-diff-del'
      return `<span class="patchly-diff-line ${cls}">${escapeHtml(line) || ' '}</span>`
    })
    .join('')
}

function confidenceClass(pct: number): string {
  if (pct >= 90) return 'high'
  if (pct >= 70) return 'medium'
  return 'low'
}

let previewKeyHandler: ((e: KeyboardEvent) => void) | null = null

function closePreviewPanel(): void {
  const panel = document.getElementById('patchly-preview-panel')
  if (panel) panel.remove()
  if (previewKeyHandler) {
    document.removeEventListener('keydown', previewKeyHandler, true)
    previewKeyHandler = null
  }
}

async function showPreview(msg: Record<string, unknown>): Promise<void> {
  const settings = await new Promise<{ autoApply: boolean; confidenceThreshold: number }>((resolve) => {
    try {
      chrome.storage.local.get(
        { autoApply: false, confidenceThreshold: 0.9 },
        (s) => resolve(chrome.runtime.lastError ? { autoApply: false, confidenceThreshold: 0.9 } : s as { autoApply: boolean; confidenceThreshold: number }),
      )
    } catch {
      resolve({ autoApply: false, confidenceThreshold: 0.9 })
    }
  })

  const confidence = typeof msg.confidence === 'number' ? msg.confidence : 0

  if (settings.autoApply && confidence >= settings.confidenceThreshold) {
    window.__patchlySendToAgent?.({ type: 'PATCHLY_CONFIRM', sessionId: msg.sessionId as string })
    showInfoToast(`Auto-applied (${Math.round(confidence * 100)}% confidence): ${msg.explanation}`)
    return
  }

  showPreviewPanel(msg)
}

// ─── Loading / progress panel ─────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  analyzing: 'Analyzing component…',
  generating: 'Asking the model…',
  building: 'Building preview…',
}
let loadingTimer: ReturnType<typeof setInterval> | null = null
let loadingStart = 0

function showLoadingPanel(): void {
  hideLoadingPanel()
  const panel = document.createElement('div')
  panel.id = 'patchly-loading'
  panel.innerHTML = `
    <div class="patchly-ld-row">
      <div class="patchly-ld-spinner"></div>
      <div class="patchly-ld-stage">${STAGE_LABELS.analyzing}</div>
      <div class="patchly-ld-time">0s</div>
    </div>
    <div class="patchly-ld-text" style="display:none"></div>
  `
  document.body.appendChild(panel)

  loadingStart = Date.now()
  const timeEl = panel.querySelector('.patchly-ld-time')!
  loadingTimer = setInterval(() => {
    timeEl.textContent = `${Math.round((Date.now() - loadingStart) / 1000)}s`
  }, 250)
}

function updateLoadingPanel({ stage, text }: { stage?: string; text?: string }): void {
  const panel = document.getElementById('patchly-loading')
  if (!panel) return
  if (stage && STAGE_LABELS[stage]) {
    panel.querySelector('.patchly-ld-stage')!.textContent = STAGE_LABELS[stage]
  }
  if (text) {
    const textEl = panel.querySelector('.patchly-ld-text') as HTMLElement
    textEl.textContent = text
    textEl.style.display = 'block'
  }
}

function hideLoadingPanel(): void {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null }
  const panel = document.getElementById('patchly-loading')
  if (panel) panel.remove()
}

window.__patchlyShowLoading = showLoadingPanel
window.__patchlyUpdateLoading = updateLoadingPanel
window.__patchlyHideLoading = hideLoadingPanel

function showPreviewPanel(msg: Record<string, unknown>): void {
  const { explanation, confidence, diff, filePath, lineNumber, sessionId } = msg
  closePreviewPanel()
  const existingToast = document.getElementById('patchly-toast')
  if (existingToast) existingToast.remove()

  const pct = Math.round((typeof confidence === 'number' ? confidence : 0) * 100)

  const panel = document.createElement('div')
  panel.id = 'patchly-preview-panel'
  panel.innerHTML = `
    <div class="patchly-pp-head">
      <div class="patchly-pp-title-row">
        <div class="patchly-pp-title">${escapeHtml(String(explanation ?? ''))}</div>
        <span class="patchly-pp-conf ${confidenceClass(pct)}">${pct}%</span>
      </div>
      <div class="patchly-pp-meta">${escapeHtml(String(filePath ?? ''))} &middot; line ${lineNumber}</div>
    </div>
    <div class="patchly-pp-diff">${renderDiff(String(diff ?? ''))}</div>
    <div class="patchly-pp-actions">
      <button class="patchly-pp-btn patchly-pp-apply">Apply<span class="patchly-pp-kbd">&crarr;</span></button>
      <button class="patchly-pp-btn patchly-pp-reject">Reject<span class="patchly-pp-kbd">Esc</span></button>
    </div>
  `

  document.body.appendChild(panel)

  const apply = (): void => {
    closePreviewPanel()
    window.__patchlySendToAgent?.({ type: 'PATCHLY_CONFIRM', sessionId: sessionId as string })
  }
  const reject = (): void => {
    closePreviewPanel()
    window.__patchlySendToAgent?.({ type: 'PATCHLY_REJECT', sessionId: sessionId as string })
  }

  ;(panel.querySelector('.patchly-pp-apply') as HTMLButtonElement).onclick = apply
  ;(panel.querySelector('.patchly-pp-reject') as HTMLButtonElement).onclick = reject

  previewKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); reject() }
  }
  document.addEventListener('keydown', previewKeyHandler, true)
}

window.__patchlyShowPreview = showPreview

function showPreviewBatch(msg: Record<string, unknown>): void {
  const { sessionId, edits } = msg as { sessionId: string; edits: Record<string, unknown>[] }
  closePreviewPanel()
  const existingToast = document.getElementById('patchly-toast')
  if (existingToast) existingToast.remove()

  const okEdits = edits.filter((e) => e.ok)
  const failEdits = edits.filter((e) => !e.ok)

  const cards = edits
    .map((e) => {
      if (e.ok) {
        const pct = Math.round((typeof e.confidence === 'number' ? e.confidence : 0) * 100)
        return `
          <div class="patchly-bp-card">
            <div class="patchly-bp-cardhead">
              <span class="patchly-bp-file">${escapeHtml(String(e.filePath ?? ''))}${e.lineNumber ? ':' + e.lineNumber : ''}${Number(e.targetCount) > 1 ? ` · ${e.targetCount} components` : ''}</span>
              <span class="patchly-pp-conf ${confidenceClass(pct)}">${pct}%</span>
            </div>
            <div class="patchly-bp-expl">${escapeHtml(String(e.explanation || ''))}</div>
            <div class="patchly-pp-diff">${renderDiff(String(e.diff ?? ''))}</div>
          </div>
        `
      }
      return `
        <div class="patchly-bp-card patchly-bp-fail">
          <div class="patchly-bp-cardhead">
            <span class="patchly-bp-file">${escapeHtml(String(e.filePath || 'target'))}${e.lineNumber ? ':' + e.lineNumber : ''}</span>
            <span class="patchly-pp-conf low">skipped</span>
          </div>
          <div class="patchly-bp-expl">${escapeHtml(String(e.message || e.code || 'Could not edit this target.'))}</div>
        </div>
      `
    })
    .join('')

  const panel = document.createElement('div')
  panel.id = 'patchly-preview-panel'
  panel.classList.add('patchly-batch')
  panel.innerHTML = `
    <div class="patchly-pp-head">
      <div class="patchly-pp-title">Review ${edits.length} changes${failEdits.length ? ` — ${failEdits.length} skipped` : ''}</div>
    </div>
    <div class="patchly-bp-cards">${cards}</div>
    <div class="patchly-pp-actions">
      <button class="patchly-pp-btn patchly-pp-apply" ${okEdits.length ? '' : 'disabled'}>Apply ${okEdits.length}<span class="patchly-pp-kbd">&crarr;</span></button>
      <button class="patchly-pp-btn patchly-pp-reject">Reject<span class="patchly-pp-kbd">Esc</span></button>
    </div>
  `

  document.body.appendChild(panel)

  const apply = (): void => {
    closePreviewPanel()
    if (okEdits.length) window.__patchlySendToAgent?.({ type: 'PATCHLY_CONFIRM', sessionId })
  }
  const reject = (): void => {
    closePreviewPanel()
    window.__patchlySendToAgent?.({ type: 'PATCHLY_REJECT', sessionId })
  }

  ;(panel.querySelector('.patchly-pp-apply') as HTMLButtonElement).onclick = apply
  ;(panel.querySelector('.patchly-pp-reject') as HTMLButtonElement).onclick = reject

  previewKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); reject() }
  }
  document.addEventListener('keydown', previewKeyHandler, true)
}

window.__patchlyShowPreviewBatch = showPreviewBatch

// ─── Toasts ──────────────────────────────────────────────────────────────────

function showSuccessToast({ filePath, showUndo = true, editId = null }: { filePath: string; showUndo?: boolean; editId?: string | null }): void {
  const existing = document.getElementById('patchly-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'patchly-toast'
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; background: #fff;
    border: 1px solid #d1fae5; border-left: 4px solid #22c55e; border-radius: 10px;
    padding: 12px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.10); z-index: 2147483647;
    max-width: 360px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px; display: flex; align-items: center; gap: 12px;
  `

  toast.innerHTML = `
    <div style="flex:1">
      <span style="color:#16a34a;font-weight:600">Applied</span>
      <span style="color:#666"> — ${filePath}</span>
    </div>
    ${showUndo ? `<button id="patchly-undo-btn" style="
      background:none;border:1px solid #d1d5db;border-radius:6px;
      padding:3px 10px;font-size:12px;cursor:pointer;color:#555;
      font-family:inherit;white-space:nowrap;
    ">Undo</button>` : ''}
  `

  document.body.appendChild(toast)

  if (showUndo) {
    const undoBtn = document.getElementById('patchly-undo-btn')
    if (undoBtn) {
      undoBtn.onclick = () => {
        toast.remove()
        window.__patchlySendToAgent?.({ type: 'PATCHLY_UNDO', editId })
      }
    }
  }

  // Offer to resolve a matching open comment for the edited element
  const matchingComment = cachedComments.find(
    (c) => c.status === 'open' && c.kind === 'element' && c.patchlySrc === selectedPatchlySrc,
  )
  if (matchingComment) {
    const resolveOfferBtn = document.createElement('button')
    resolveOfferBtn.textContent = 'Resolve comment?'
    resolveOfferBtn.style.cssText =
      'margin-left:6px;padding:2px 8px;border-radius:4px;border:1px solid #7c3aed;background:transparent;color:#a78bfa;cursor:pointer;font-size:12px;'
    resolveOfferBtn.addEventListener('click', () => {
      resolveComment(matchingComment.id, 'dev')
      resolveOfferBtn.remove()
    })
    toast.appendChild(resolveOfferBtn)
  }

  setTimeout(() => {
    if (document.getElementById('patchly-toast') === toast) toast.remove()
  }, 6000)
}

function showErrorToast(message: string): void {
  const existing = document.getElementById('patchly-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'patchly-toast'
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; background: #fff;
    border: 1px solid #fee2e2; border-left: 4px solid #ef4444; border-radius: 10px;
    padding: 12px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.10); z-index: 2147483647;
    max-width: 360px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
  `

  toast.innerHTML = `
    <div style="color:#dc2626;font-weight:600;margin-bottom:4px">Patchly error</div>
    <div style="color:#666;line-height:1.4">${message}</div>
  `

  document.body.appendChild(toast)
  setTimeout(() => {
    if (document.getElementById('patchly-toast') === toast) toast.remove()
  }, 8000)
}

function showInfoToast(message: string): void {
  const existing = document.getElementById('patchly-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'patchly-toast'
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; background: #fff;
    border: 1px solid #e0e7ff; border-left: 4px solid #6366f1; border-radius: 10px;
    padding: 12px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.10); z-index: 2147483647;
    max-width: 360px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
  `

  toast.innerHTML = `
    <div style="color:#4f46e5;font-weight:600;margin-bottom:4px">Patchly</div>
    <div style="color:#666;line-height:1.4">${message}</div>
  `

  document.body.appendChild(toast)
  setTimeout(() => {
    if (document.getElementById('patchly-toast') === toast) toast.remove()
  }, 8000)
}

window.__patchlyShowSuccess = showSuccessToast
window.__patchlyShowError = showErrorToast
window.__patchlyShowInfo = showInfoToast

// ─── Cross-file redirect ──────────────────────────────────────────────────────

function srcFileStem(src: string): string {
  const file = (src || '').split(':')[0]
  const base = file.split('/').pop() || file
  return base.replace(/\.(jsx?|tsx?)$/i, '')
}

function findElementByFile(anchorEl: Element | null, fileHint: string): Element | null {
  const wantStem = srcFileStem(fileHint)

  const pick = (scope: Element | null): Element | null => {
    if (!scope) return null
    const all: Element[] = [...scope.querySelectorAll('[data-patchly-src]')]
    const scopeDataset = (scope as HTMLElement).dataset
    if (scopeDataset?.patchlySrc) all.unshift(scope)
    const matches = all.filter((el) => {
      const ds = (el as HTMLElement).dataset
      return ds?.patchlySrc && srcFileStem(ds.patchlySrc) === wantStem
    })
    if (matches.length === 0) return null
    return matches.find((el) => !matches.some((o) => o !== el && o.contains(el))) ?? matches[0] ?? null
  }

  let scope: Element | null = anchorEl
  while (scope) {
    const found = pick(scope)
    if (found) return found
    scope = scope.parentElement
  }
  return null
}

function showRedirectToast(msg: Record<string, unknown>): void {
  const { sessionId, prompt, suggestions } = msg as {
    sessionId: string
    prompt: string
    suggestions: Array<{ file: string; reason: string }>
  }
  void sessionId

  const existing = document.getElementById('patchly-toast')
  if (existing) existing.remove()

  const anchorEl = selectedElement
  const buttons = suggestions
    .map((s, i) => {
      const found = findElementByFile(anchorEl, s.file)
      const stem = srcFileStem(s.file)
      return `
        <button class="patchly-rd-btn" data-idx="${i}" ${found ? '' : 'disabled'}>
          Edit <strong>${stem}</strong>${found ? '' : ' (not on page)'}
        </button>
      `
    })
    .join('')

  const reasons = suggestions[0]?.reason
    ? `<div style="color:#666;margin-bottom:10px;line-height:1.4">${suggestions[0].reason}</div>`
    : ''

  const toast = document.createElement('div')
  toast.id = 'patchly-toast'
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; background: #fff;
    border: 1px solid #e0e7ff; border-left: 4px solid #6366f1; border-radius: 10px;
    padding: 14px 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); z-index: 2147483647;
    max-width: 380px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px; pointer-events: all;
  `
  toast.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;color:#1a1a1a">This change lives in another component</div>
    ${reasons}
    <div style="display:flex;flex-direction:column;gap:6px">
      ${buttons}
      <button class="patchly-rd-cancel" style="background:none;border:none;color:#999;font-size:12px;cursor:pointer;padding:4px 0">Cancel</button>
    </div>
  `

  document.body.appendChild(toast)

  toast.querySelectorAll<HTMLButtonElement>('.patchly-rd-btn').forEach((btn) => {
    if (btn.disabled) return
    btn.onclick = () => {
      const s = suggestions[Number(btn.getAttribute('data-idx'))]
      const el = findElementByFile(anchorEl, s.file)
      toast.remove()
      if (el) sendSingleEdit(el, (el as HTMLElement).dataset.patchlySrc ?? null, prompt)
    }
  })
  ;(toast.querySelector('.patchly-rd-cancel') as HTMLButtonElement).onclick = () => toast.remove()
}

window.__patchlyShowRedirect = showRedirectToast

// ─── Direct class panel (Tailwind mode) ──────────────────────────────────────

window.__patchlyShowElementInfo = function (msg: Record<string, unknown>): void {
  const sessionId = msg.sessionId as string | undefined
  if (sessionId && sessionId !== pendingInspectSessionId) return
  pendingInspectSessionId = null
  if (activeMode !== 'tailwind') return
  const theme = (window.__patchlyGetTheme?.() ?? { colors: [] }) as unknown as ThemeTokens
  const elements = (msg.elements ?? []) as ClassInfo[]
  showClassPanel(elements, theme)
}

window.__patchlyClassEditError = classEditError
window.__patchlyClassEditApplied = classEditApplied
// Sidebar's own × button closed it → drop the Tailwind selection (stay in editing mode).
window.__patchlyClassPanelClosed = function (): void {
  selectedSet = []
  selectedTargets = null
  clearSelHighlights()
}

// classPanel calls this on section mouseenter/mouseleave to highlight the hovered element.
window.__patchlyHoverBySrc = (src: string | null): void => {
  if (!src) {
    if (elementHighlight) elementHighlight.style.display = 'none'
    if (componentLabel) componentLabel.style.display = 'none'
    return
  }
  const el = document.querySelector(`[data-patchly-src="${CSS.escape(src)}"]`)
  if (!el || !elementHighlight) return
  const r = el.getBoundingClientRect()
  positionBox(elementHighlight, r)
  elementHighlight.style.display = 'block'
  if (componentLabel) {
    componentLabel.textContent = src.split(':')[0].split('/').pop() ?? ''
    componentLabel.style.left = r.left + 'px'
    componentLabel.style.top = (r.top - 22) + 'px'
    componentLabel.style.display = 'block'
  }
}
