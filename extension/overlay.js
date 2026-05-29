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

  selectedElement = candidates[0]
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

function submitPrompt() {
  const prompt = promptInput.value.trim()
  if (!prompt) {
    promptInput.focus()
    return
  }

  if (!selectedElement) {
    console.log('[Patchly] No element selected')
    return
  }

  const payload = {
    patchlySrc: selectedPatchlySrc,
    elementHtml: selectedElement.outerHTML.slice(0, 500),
    elementClasses: selectedElement.className || '',
    elementTag: selectedElement.tagName.toLowerCase(),
    prompt: prompt,
    sessionId: Math.random().toString(36).slice(2),
  }

  console.log('[Patchly] Edit request payload:', payload)
  console.log('[Patchly] patchlySrc:', payload.patchlySrc || 'NOT FOUND — source mapping not working')

  const submitBtn = document.getElementById('patchly-prompt-submit')
  submitBtn.textContent = 'Logged'
  submitBtn.style.background = '#22c55e'
  setTimeout(() => cancel(), 1000)
}

window.__patchlyActivate = activate
window.__patchlyCancel = cancel
