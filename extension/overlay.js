// extension/overlay.js
// Handles all visual selection UI. No imports — injected as a plain script.

const PATCHLY_PORT = 7842

// State
let isActive = false
let isDragging = false
let startX = 0, startY = 0
let currentX = 0, currentY = 0
let selectedElement = null
let selectedPatchlySrc = null

// DOM elements (created once, reused)
let root, selectionRect, elementHighlight, promptBar, promptInput, componentLabel

function init() {
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

  promptBar = document.createElement('div')
  promptBar.id = 'patchly-prompt-bar'
  promptBar.innerHTML = `
    <input id="patchly-prompt-input" type="text" placeholder="Describe what to change..." autocomplete="off" />
    <button id="patchly-prompt-submit">Apply</button>
    <button id="patchly-prompt-cancel">x</button>
  `
  document.body.appendChild(promptBar)

  promptInput = document.getElementById('patchly-prompt-input')

  document.getElementById('patchly-prompt-submit').addEventListener('click', submitPrompt)
  document.getElementById('patchly-prompt-cancel').addEventListener('click', cancel)

  root.addEventListener('mousedown', onMouseDown)
  root.addEventListener('mousemove', onMouseMove)
  root.addEventListener('mouseup', onMouseUp)

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPrompt()
    if (e.key === 'Escape') cancel()
    e.stopPropagation()
  })
}

function activate() {
  if (isActive) return
  isActive = true
  init()
  root.classList.add('active')
  console.log('[Patchly] Selection mode activated. Draw a box around what to change.')
}

function cancel() {
  isActive = false
  isDragging = false
  selectedElement = null
  selectedPatchlySrc = null

  if (root) root.classList.remove('active')
  if (selectionRect) selectionRect.style.display = 'none'
  if (elementHighlight) elementHighlight.style.display = 'none'
  if (promptBar) promptBar.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'
  if (promptInput) promptInput.value = ''
  hidePicker()
}

function onMouseDown(e) {
  if (!isActive) return
  e.preventDefault()
  isDragging = true
  startX = e.clientX
  startY = e.clientY
  currentX = e.clientX
  currentY = e.clientY

  promptBar.style.display = 'none'
  componentLabel.style.display = 'none'
  promptInput.value = ''
  hidePicker()

  updateSelectionRect()
  selectionRect.style.display = 'block'
}

function onMouseMove(e) {
  if (!isDragging) return
  currentX = e.clientX
  currentY = e.clientY
  updateSelectionRect()
}

function onMouseUp(e) {
  if (!isDragging) return
  isDragging = false
  currentX = e.clientX
  currentY = e.clientY

  const rect = getSelectionRect()

  if (rect.width < 5 || rect.height < 5) {
    cancel()
    return
  }

  findTargetElement(rect)
}

function updateSelectionRect() {
  const rect = getSelectionRect()
  selectionRect.style.left = rect.x + 'px'
  selectionRect.style.top = rect.y + 'px'
  selectionRect.style.width = rect.width + 'px'
  selectionRect.style.height = rect.height + 'px'
}

function getSelectionRect() {
  return {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  }
}

function findTargetElement(rect) {
  // Collect distinct mapped components whose source span the selection covers.
  const srcCandidates = gatherSrcCandidates(rect)

  // Ambiguous selection → let the user pick which component they meant, instead
  // of guessing and risking a TARGET_DRIFTED on a container/component boundary.
  if (srcCandidates.length > 1) {
    showComponentPicker(rect, srcCandidates)
    return
  }

  let el
  if (srcCandidates.length === 1) {
    el = srcCandidates[0].el
  } else {
    el = pickByCenter(rect)
  }

  if (!el) {
    console.log('[Patchly] No element found in selection')
    cancel()
    return
  }

  selectElement(el, rect)
}

// Rect intersection area between the selection and an element's bounding box.
function overlapArea(rect, elRect) {
  const ox = Math.max(0, Math.min(rect.x + rect.width, elRect.right) - Math.max(rect.x, elRect.left))
  const oy = Math.max(0, Math.min(rect.y + rect.height, elRect.bottom) - Math.max(rect.y, elRect.top))
  return ox * oy
}

// Find elements carrying data-patchly-src that the selection box mostly contains
// (≥50% of the element's own area), deduped by source and reduced to outermost
// nodes so we list distinct components, not their nested children.
function gatherSrcCandidates(rect) {
  const found = []
  const seen = new Set()

  document.querySelectorAll('[data-patchly-src]').forEach((el) => {
    if (el.id && el.id.startsWith('patchly-')) return
    const elRect = el.getBoundingClientRect()
    const elArea = elRect.width * elRect.height
    if (elArea <= 0) return

    const overlap = overlapArea(rect, elRect)
    if (overlap <= 0) return
    if (overlap / elArea < 0.5) return  // box must contain most of the element

    const src = el.dataset.patchlySrc
    if (seen.has(src)) return
    seen.add(src)
    found.push({ el, src, area: elArea })
  })

  // Drop any candidate that is a descendant of another candidate (keep outermost).
  const outermost = found.filter(
    (c) => !found.some((other) => other !== c && other.el.contains(c.el)),
  )

  // Largest first — the most prominent components at the top of the list.
  outermost.sort((a, b) => b.area - a.area)
  return outermost
}

// Fallback when no element cleanly fits the box: pick the deepest element under
// the selection's center that covers ≥50% of the selection.
function pickByCenter(rect) {
  root.style.display = 'none'
  selectionRect.style.display = 'none'
  elementHighlight.style.display = 'none'

  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const elements = document.elementsFromPoint(centerX, centerY)

  root.style.display = ''
  selectionRect.style.display = 'block'
  elementHighlight.style.display = 'none'

  const candidates = elements.filter((el) => {
    const tag = el.tagName.toLowerCase()
    if (['html', 'body', 'script', 'style', 'head'].includes(tag)) return false
    if (el.id && el.id.startsWith('patchly-')) return false
    return true
  })

  if (candidates.length === 0) return null

  const selectionArea = rect.width * rect.height
  let best = candidates[0]
  for (const el of candidates) {
    const coverage = overlapArea(rect, el.getBoundingClientRect()) / selectionArea
    if (coverage >= 0.5) {
      best = el
      break
    }
  }
  return best
}

// Commit a chosen element: highlight it, label it, and open the prompt bar.
function selectElement(el, rect) {
  selectedElement = el
  selectedPatchlySrc = el.dataset.patchlySrc || null

  const elRect = el.getBoundingClientRect()
  elementHighlight.style.left = elRect.left + 'px'
  elementHighlight.style.top = elRect.top + 'px'
  elementHighlight.style.width = elRect.width + 'px'
  elementHighlight.style.height = elRect.height + 'px'
  elementHighlight.style.display = 'block'

  const srcParts = selectedPatchlySrc ? selectedPatchlySrc.split(':') : null
  const fileName = srcParts ? srcParts[0].split('/').pop() : el.tagName.toLowerCase()
  componentLabel.textContent = fileName
  componentLabel.style.left = elRect.left + 'px'
  componentLabel.style.top = (elRect.top - 22) + 'px'
  componentLabel.style.display = 'block'

  const selRect = rect || getSelectionRect()
  const promptY = Math.min(selRect.y + selRect.height + 8, window.innerHeight - 60)
  promptBar.style.left = selRect.x + 'px'
  promptBar.style.top = promptY + 'px'
  promptBar.style.display = 'flex'

  setTimeout(() => promptInput.focus(), 50)
}

// Show a small list of candidate components and let the user click the one they
// meant. Hovering a row highlights that element on the page.
function showComponentPicker(rect, candidates) {
  let picker = document.getElementById('patchly-picker')
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
          <span class="patchly-picker-tag">${tag}</span>
          <span class="patchly-picker-main">
            <span class="patchly-picker-file">${fileLabel}</span>
            <span class="patchly-picker-text">${escapeHtml(text)}</span>
          </span>
        </div>
      `
    })
    .join('')

  picker.innerHTML = `<div class="patchly-picker-head">Which component?</div>${rows}`

  const px = Math.min(rect.x, window.innerWidth - 380)
  const py = Math.min(rect.y + 4, window.innerHeight - 340)
  picker.style.left = Math.max(8, px) + 'px'
  picker.style.top = Math.max(8, py) + 'px'
  picker.style.display = 'block'

  picker.querySelectorAll('.patchly-picker-row').forEach((row) => {
    const c = candidates[Number(row.getAttribute('data-idx'))]
    row.addEventListener('mouseenter', () => {
      const r = c.el.getBoundingClientRect()
      elementHighlight.style.left = r.left + 'px'
      elementHighlight.style.top = r.top + 'px'
      elementHighlight.style.width = r.width + 'px'
      elementHighlight.style.height = r.height + 'px'
      elementHighlight.style.display = 'block'
    })
    row.addEventListener('click', () => {
      hidePicker()
      selectElement(c.el, rect)
    })
  })
}

function hidePicker() {
  const picker = document.getElementById('patchly-picker')
  if (picker) picker.style.display = 'none'
}

// Capture a cropped screenshot of `element` via the background service worker.
// Returns the raw base64 string (no data: prefix), or null on any failure.
async function captureElementScreenshot(element) {
  try {
    const rect = element.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[Patchly] Screenshot:', chrome.runtime.lastError.message)
          resolve(null)
        } else {
          resolve(res)
        }
      })
    })

    if (!response?.ok || !response.dataUrl) {
      if (response?.error) console.warn('[Patchly] Screenshot failed:', response.error)
      return null
    }

    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = response.dataUrl
    })

    const cropX = Math.round(rect.left * dpr)
    const cropY = Math.round(rect.top * dpr)
    const cropW = Math.max(1, Math.round(rect.width * dpr))
    const cropH = Math.max(1, Math.round(rect.height * dpr))

    const canvas = document.createElement('canvas')
    canvas.width = cropW
    canvas.height = cropH
    canvas.getContext('2d').drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    return canvas.toDataURL('image/png').replace('data:image/png;base64,', '')
  } catch (err) {
    console.warn('[Patchly] Screenshot exception:', err.message)
    return null
  }
}

async function submitPrompt() {
  const prompt = promptInput.value.trim()
  if (!prompt) {
    promptInput.focus()
    return
  }

  if (!selectedElement) {
    console.log('[Patchly] No element selected')
    return
  }

  // Hide patchly overlays before capturing so they don't appear in the screenshot.
  if (selectionRect) selectionRect.style.display = 'none'
  if (elementHighlight) elementHighlight.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'

  // Let the browser repaint before capturing.
  await new Promise(resolve => requestAnimationFrame(resolve))

  const screenshot_base64 = await captureElementScreenshot(selectedElement)

  const payload = {
    patchlySrc: selectedPatchlySrc,
    elementHtml: selectedElement.outerHTML.slice(0, 500),
    elementClasses: selectedElement.className || '',
    elementTag: selectedElement.tagName.toLowerCase(),
    prompt,
    sessionId: Math.random().toString(36).slice(2),
    screenshot_base64,
  }

  console.log('[Patchly] Edit request (screenshot:', screenshot_base64 ? 'captured' : 'none', ')')

  if (window.__patchlySend) {
    window.__patchlySend(payload)
    // Replace the prompt bar with a live progress panel so the wait feels active.
    if (promptBar) promptBar.style.display = 'none'
    promptInput.value = ''
    promptInput.disabled = false
    const submitBtn = document.getElementById('patchly-prompt-submit')
    submitBtn.textContent = 'Apply'
    submitBtn.disabled = false
    submitBtn.style.background = ''
    showLoadingPanel()
  } else {
    console.warn('[Patchly] __patchlySend not available')
  }
}

function resetPromptBar() {
  const submitBtn = document.getElementById('patchly-prompt-submit')
  if (submitBtn) {
    submitBtn.textContent = 'Apply'
    submitBtn.disabled = false
    submitBtn.style.background = ''
  }
  if (promptInput) {
    promptInput.disabled = false
    promptInput.value = ''
  }
  if (promptBar) promptBar.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'
}

window.__patchlyResetPromptBar = resetPromptBar

window.__patchlyActivate = activate
window.__patchlyCancel = cancel

// Escape user/LLM-provided text before injecting into innerHTML.
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Render a unified diff string into color-coded <span> rows.
function renderDiff(diff) {
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

function confidenceClass(pct) {
  if (pct >= 90) return 'high'
  if (pct >= 70) return 'medium'
  return 'low'
}

let previewKeyHandler = null

function closePreviewPanel() {
  const panel = document.getElementById('patchly-preview-panel')
  if (panel) panel.remove()
  if (previewKeyHandler) {
    document.removeEventListener('keydown', previewKeyHandler, true)
    previewKeyHandler = null
  }
}

// Decide whether to auto-apply (high confidence + opt-in) or show the diff panel.
async function showPreview(msg) {
  const settings = await new Promise((resolve) => {
    try {
      chrome.storage.local.get(
        { autoApply: false, confidenceThreshold: 0.9 },
        (s) => resolve(chrome.runtime.lastError ? { autoApply: false, confidenceThreshold: 0.9 } : s),
      )
    } catch {
      resolve({ autoApply: false, confidenceThreshold: 0.9 })
    }
  })

  const confidence = typeof msg.confidence === 'number' ? msg.confidence : 0

  if (settings.autoApply && confidence >= settings.confidenceThreshold) {
    if (window.__patchlySendToAgent) {
      window.__patchlySendToAgent({ type: 'PATCHLY_CONFIRM', sessionId: msg.sessionId })
    }
    showInfoToast(`Auto-applied (${Math.round(confidence * 100)}% confidence): ${msg.explanation}`)
    return
  }

  showPreviewPanel(msg)
}

// ─── Loading / progress panel ────────────────────────────────────────────────
const STAGE_LABELS = {
  analyzing: 'Analyzing component…',
  generating: 'Asking the model…',
  building: 'Building preview…',
}
let loadingTimer = null
let loadingStart = 0

function showLoadingPanel() {
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
  const timeEl = panel.querySelector('.patchly-ld-time')
  loadingTimer = setInterval(() => {
    timeEl.textContent = `${Math.round((Date.now() - loadingStart) / 1000)}s`
  }, 250)
}

function updateLoadingPanel({ stage, text }) {
  const panel = document.getElementById('patchly-loading')
  if (!panel) return
  if (stage && STAGE_LABELS[stage]) {
    panel.querySelector('.patchly-ld-stage').textContent = STAGE_LABELS[stage]
  }
  if (text) {
    const textEl = panel.querySelector('.patchly-ld-text')
    textEl.textContent = text
    textEl.style.display = 'block'
  }
}

function hideLoadingPanel() {
  if (loadingTimer) {
    clearInterval(loadingTimer)
    loadingTimer = null
  }
  const panel = document.getElementById('patchly-loading')
  if (panel) panel.remove()
}

window.__patchlyShowLoading = showLoadingPanel
window.__patchlyUpdateLoading = updateLoadingPanel
window.__patchlyHideLoading = hideLoadingPanel

function showPreviewPanel({ explanation, confidence, diff, filePath, lineNumber, sessionId }) {
  closePreviewPanel()
  const existingToast = document.getElementById('patchly-toast')
  if (existingToast) existingToast.remove()

  const pct = Math.round((typeof confidence === 'number' ? confidence : 0) * 100)

  const panel = document.createElement('div')
  panel.id = 'patchly-preview-panel'
  panel.innerHTML = `
    <div class="patchly-pp-head">
      <div class="patchly-pp-title-row">
        <div class="patchly-pp-title">${escapeHtml(explanation)}</div>
        <span class="patchly-pp-conf ${confidenceClass(pct)}">${pct}%</span>
      </div>
      <div class="patchly-pp-meta">${escapeHtml(filePath)} &middot; line ${lineNumber}</div>
    </div>
    <div class="patchly-pp-diff">${renderDiff(diff)}</div>
    <div class="patchly-pp-actions">
      <button class="patchly-pp-btn patchly-pp-apply">Apply<span class="patchly-pp-kbd">&crarr;</span></button>
      <button class="patchly-pp-btn patchly-pp-reject">Reject<span class="patchly-pp-kbd">Esc</span></button>
    </div>
  `

  document.body.appendChild(panel)

  const apply = () => {
    closePreviewPanel()
    if (window.__patchlySendToAgent) {
      window.__patchlySendToAgent({ type: 'PATCHLY_CONFIRM', sessionId })
    }
  }
  const reject = () => {
    closePreviewPanel()
    if (window.__patchlySendToAgent) {
      window.__patchlySendToAgent({ type: 'PATCHLY_REJECT', sessionId })
    }
  }

  panel.querySelector('.patchly-pp-apply').onclick = apply
  panel.querySelector('.patchly-pp-reject').onclick = reject

  // Scoped key handling: Enter applies, Esc rejects. Capture phase + stopPropagation
  // so the global Esc handler in content.js doesn't also fire selection-cancel.
  previewKeyHandler = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      apply()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      reject()
    }
  }
  document.addEventListener('keydown', previewKeyHandler, true)
}

window.__patchlyShowPreview = showPreview

function showSuccessToast({ filePath, showUndo = true, editId = null }) {
  const existing = document.getElementById('patchly-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'patchly-toast'
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #fff;
    border: 1px solid #d1fae5;
    border-left: 4px solid #22c55e;
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.10);
    z-index: 2147483647;
    max-width: 360px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 12px;
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
    document.getElementById('patchly-undo-btn').onclick = () => {
      toast.remove()
      if (window.__patchlySendToAgent) {
        window.__patchlySendToAgent({ type: 'PATCHLY_UNDO', editId })
      }
    }
  }

  setTimeout(() => {
    if (document.getElementById('patchly-toast') === toast) toast.remove()
  }, 6000)
}

function showErrorToast(message) {
  const existing = document.getElementById('patchly-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'patchly-toast'
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #fff;
    border: 1px solid #fee2e2;
    border-left: 4px solid #ef4444;
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.10);
    z-index: 2147483647;
    max-width: 360px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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

function showInfoToast(message) {
  const existing = document.getElementById('patchly-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'patchly-toast'
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #fff;
    border: 1px solid #e0e7ff;
    border-left: 4px solid #6366f1;
    border-radius: 10px;
    padding: 12px 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.10);
    z-index: 2147483647;
    max-width: 360px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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

// ─── Edit history sidebar ─────────────────────────────────────────────────────
// Source of truth is chrome.storage.session ('patchly_edits'); content.js writes
// it on EDIT_DONE / UNDO_DONE. This module only renders and wires per-row undo.

const PATCHLY_HISTORY_KEY = 'patchly_edits'
let historyInited = false

function readHistory() {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.get({ [PATCHLY_HISTORY_KEY]: [] }, (res) => {
        resolve(chrome.runtime.lastError ? [] : (res[PATCHLY_HISTORY_KEY] || []))
      })
    } catch {
      resolve([])
    }
  })
}

function ensureHistoryUI() {
  if (historyInited) return
  historyInited = true

  const tab = document.createElement('button')
  tab.id = 'patchly-history-tab'
  tab.textContent = 'Patchly edits'
  tab.onclick = openHistory
  document.body.appendChild(tab)

  const panel = document.createElement('div')
  panel.id = 'patchly-history'
  panel.innerHTML = `
    <div class="patchly-hist-head">
      <span>Patchly edits</span>
      <button class="patchly-hist-close" title="Close">&times;</button>
    </div>
    <div class="patchly-hist-list"></div>
  `
  document.body.appendChild(panel)
  panel.querySelector('.patchly-hist-close').onclick = closeHistory
}

function relativeTime(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

async function renderHistory() {
  ensureHistoryUI()
  const edits = await readHistory()
  const tab = document.getElementById('patchly-history-tab')
  if (tab) tab.style.display = edits.length ? 'block' : 'none'

  const list = document.querySelector('#patchly-history .patchly-hist-list')
  if (!list) return

  if (!edits.length) {
    list.innerHTML = '<div class="patchly-hist-empty">No edits yet this session.</div>'
    return
  }

  // Newest first.
  list.innerHTML = edits
    .slice()
    .reverse()
    .map((e) => {
      const undone = e.undone
      return `
        <div class="patchly-hist-row${undone ? ' undone' : ''}" data-edit-id="${escapeHtml(e.editId)}">
          <div class="patchly-hist-main">
            <div class="patchly-hist-file">${escapeHtml(e.filePath)}:${e.lineNumber ?? '?'}</div>
            <div class="patchly-hist-expl">${escapeHtml(e.explanation || 'Edit')}</div>
            <div class="patchly-hist-ts">${relativeTime(e.ts)}${undone ? ' · undone' : ''}</div>
          </div>
          <button class="patchly-hist-undo" ${undone ? 'disabled' : ''}>&#8624;</button>
        </div>
      `
    })
    .join('')

  list.querySelectorAll('.patchly-hist-row').forEach((row) => {
    const editId = row.getAttribute('data-edit-id')
    const btn = row.querySelector('.patchly-hist-undo')
    if (btn && !btn.disabled) {
      btn.onclick = () => {
        if (window.__patchlySendToAgent) {
          window.__patchlySendToAgent({ type: 'PATCHLY_UNDO', editId })
        }
      }
    }
  })
}

function openHistory() {
  ensureHistoryUI()
  const panel = document.getElementById('patchly-history')
  if (panel) panel.classList.add('open')
  renderHistory()
}

function closeHistory() {
  const panel = document.getElementById('patchly-history')
  if (panel) panel.classList.remove('open')
}

window.__patchlyRenderHistory = renderHistory
window.__patchlyOpenHistory = openHistory
