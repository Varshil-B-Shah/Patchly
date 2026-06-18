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
  root.style.display = 'none'
  selectionRect.style.display = 'none'
  elementHighlight.style.display = 'none'

  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2

  const elements = document.elementsFromPoint(centerX, centerY)

  root.style.display = ''
  selectionRect.style.display = 'block'
  elementHighlight.style.display = 'none'

  const candidates = elements.filter(el => {
    const tag = el.tagName.toLowerCase()
    if (['html', 'body', 'script', 'style', 'head'].includes(tag)) return false
    if (el.id && el.id.startsWith('patchly-')) return false
    return true
  })

  if (candidates.length === 0) {
    console.log('[Patchly] No element found in selection')
    cancel()
    return
  }

  // Find the most specific element that covers at least 50% of the selection.
  // candidates is ordered deepest-first, so the first qualifying match is the
  // most specific element that actually "fits" the selection the user drew.
  const selectionArea = rect.width * rect.height
  let bestCandidate = candidates[0]

  for (const el of candidates) {
    const elRect = el.getBoundingClientRect()
    const overlapX = Math.max(0, Math.min(rect.x + rect.width, elRect.right) - Math.max(rect.x, elRect.left))
    const overlapY = Math.max(0, Math.min(rect.y + rect.height, elRect.bottom) - Math.max(rect.y, elRect.top))
    const coverage = (overlapX * overlapY) / selectionArea
    if (coverage >= 0.5) {
      bestCandidate = el
      break
    }
  }

  selectedElement = bestCandidate
  selectedPatchlySrc = selectedElement.dataset.patchlySrc || null

  const elRect = selectedElement.getBoundingClientRect()
  elementHighlight.style.left = elRect.left + 'px'
  elementHighlight.style.top = elRect.top + 'px'
  elementHighlight.style.width = elRect.width + 'px'
  elementHighlight.style.height = elRect.height + 'px'
  elementHighlight.style.display = 'block'

  const srcParts = selectedPatchlySrc ? selectedPatchlySrc.split(':') : null
  const fileName = srcParts ? srcParts[0].split('/').pop() : selectedElement.tagName.toLowerCase()
  componentLabel.textContent = fileName
  componentLabel.style.left = elRect.left + 'px'
  componentLabel.style.top = (elRect.top - 22) + 'px'
  componentLabel.style.display = 'block'

  const selRect = getSelectionRect()
  const promptY = Math.min(selRect.y + selRect.height + 8, window.innerHeight - 60)
  promptBar.style.left = selRect.x + 'px'
  promptBar.style.top = promptY + 'px'
  promptBar.style.display = 'flex'

  setTimeout(() => promptInput.focus(), 50)
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
    const submitBtn = document.getElementById('patchly-prompt-submit')
    submitBtn.textContent = '...'
    submitBtn.disabled = true
    submitBtn.style.background = '#818cf8'
    promptInput.disabled = true
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

function showPreviewToast({ explanation, find, replace, filePath, lineNumber, sessionId }) {
  const existing = document.getElementById('patchly-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'patchly-toast'
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    z-index: 2147483647;
    max-width: 380px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    pointer-events: all;
  `

  toast.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;color:#1a1a1a">
      Patchly will:
    </div>
    <div style="color:#444;margin-bottom:10px;line-height:1.4">
      ${explanation}
    </div>
    <div style="font-size:11px;color:#888;margin-bottom:12px">
      ${filePath} &middot; line ${lineNumber}
    </div>
    <div style="display:flex;gap:8px">
      <button id="patchly-confirm" style="
        flex:1;background:#6366f1;color:#fff;border:none;
        border-radius:7px;padding:7px;font-size:13px;cursor:pointer;
        font-family:inherit;
      ">Apply</button>
      <button id="patchly-reject" style="
        flex:1;background:#f5f5f5;color:#444;border:none;
        border-radius:7px;padding:7px;font-size:13px;cursor:pointer;
        font-family:inherit;
      ">Cancel</button>
    </div>
  `

  document.body.appendChild(toast)

  document.getElementById('patchly-confirm').onclick = () => {
    toast.remove()
    if (window.__patchlySendToAgent) {
      window.__patchlySendToAgent({ type: 'PATCHLY_CONFIRM', sessionId })
    }
  }

  document.getElementById('patchly-reject').onclick = () => {
    toast.remove()
    if (window.__patchlySendToAgent) {
      window.__patchlySendToAgent({ type: 'PATCHLY_REJECT', sessionId })
    }
  }

  setTimeout(() => {
    if (document.getElementById('patchly-toast') === toast) toast.remove()
  }, 30000)
}

window.__patchlyShowPreview = showPreviewToast

function showSuccessToast({ filePath, showUndo = true }) {
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
        window.__patchlySendToAgent({ type: 'PATCHLY_UNDO' })
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
