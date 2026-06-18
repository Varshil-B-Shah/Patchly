// extension/overlay.ts
// Handles all visual selection UI. Bundled as IIFE by esbuild.

const PATCHLY_PORT = 7842

interface SrcCandidate {
  el: Element
  src: string
  area: number
}

// State
let isActive = false
let isDragging = false
let startX = 0, startY = 0
let currentX = 0, currentY = 0
let selectedElement: Element | null = null
let selectedPatchlySrc: string | null = null
let selectedTargets: Element[] | null = null

// DOM elements (created once, reused)
let root: HTMLDivElement | null = null
let selectionRect: HTMLDivElement | null = null
let elementHighlight: HTMLDivElement | null = null
let promptBar: HTMLDivElement | null = null
let promptInput: HTMLInputElement | null = null
let componentLabel: HTMLDivElement | null = null

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

  promptBar = document.createElement('div')
  promptBar.id = 'patchly-prompt-bar'
  promptBar.innerHTML = `
    <input id="patchly-prompt-input" type="text" placeholder="Describe what to change..." autocomplete="off" />
    <button id="patchly-prompt-submit">Apply</button>
    <button id="patchly-prompt-cancel">x</button>
  `
  document.body.appendChild(promptBar)

  promptInput = document.getElementById('patchly-prompt-input') as HTMLInputElement

  document.getElementById('patchly-prompt-submit')!.addEventListener('click', submitPrompt)
  document.getElementById('patchly-prompt-cancel')!.addEventListener('click', cancel)

  root.addEventListener('mousedown', onMouseDown)
  root.addEventListener('mousemove', onMouseMove)
  root.addEventListener('mouseup', onMouseUp)

  promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') submitPrompt()
    if (e.key === 'Escape') cancel()
    e.stopPropagation()
  })
}

function activate(): void {
  if (isActive) return
  isActive = true
  init()
  root?.classList.add('active')
  console.log('[Patchly] Selection mode activated. Draw a box around what to change.')
}

function cancel(): void {
  isActive = false
  isDragging = false
  selectedElement = null
  selectedPatchlySrc = null
  selectedTargets = null

  root?.classList.remove('active')
  if (selectionRect) selectionRect.style.display = 'none'
  if (elementHighlight) elementHighlight.style.display = 'none'
  if (promptBar) promptBar.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'
  if (promptInput) promptInput.value = ''
  hidePicker()
}

function onMouseDown(e: MouseEvent): void {
  if (!isActive) return
  e.preventDefault()
  isDragging = true
  startX = e.clientX
  startY = e.clientY
  currentX = e.clientX
  currentY = e.clientY

  if (promptBar) promptBar.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'
  if (promptInput) promptInput.value = ''
  hidePicker()

  updateSelectionRect()
  if (selectionRect) selectionRect.style.display = 'block'
}

function onMouseMove(e: MouseEvent): void {
  if (!isDragging) return
  currentX = e.clientX
  currentY = e.clientY
  updateSelectionRect()
}

function onMouseUp(e: MouseEvent): void {
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

function updateSelectionRect(): void {
  const rect = getSelectionRect()
  if (!selectionRect) return
  selectionRect.style.left = rect.x + 'px'
  selectionRect.style.top = rect.y + 'px'
  selectionRect.style.width = rect.width + 'px'
  selectionRect.style.height = rect.height + 'px'
}

interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

function getSelectionRect(): SelectionRect {
  return {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  }
}

function findTargetElement(rect: SelectionRect): void {
  const srcCandidates = gatherSrcCandidates(rect)

  if (srcCandidates.length > 1) {
    showComponentPicker(rect, srcCandidates)
    return
  }

  let el: Element | null
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

  const outermost = found.filter(
    (c) => !found.some((other) => other !== c && other.el.contains(c.el)),
  )
  outermost.sort((a, b) => b.area - a.area)
  return outermost
}

function pickByCenter(rect: SelectionRect): Element | null {
  if (root) root.style.display = 'none'
  if (selectionRect) selectionRect.style.display = 'none'
  if (elementHighlight) elementHighlight.style.display = 'none'

  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const elements = document.elementsFromPoint(centerX, centerY)

  if (root) root.style.display = ''
  if (selectionRect) selectionRect.style.display = 'block'
  if (elementHighlight) elementHighlight.style.display = 'none'

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
  return best ?? null
}

function selectElement(el: Element, rect: SelectionRect): void {
  selectedElement = el
  selectedPatchlySrc = (el as HTMLElement).dataset.patchlySrc ?? null

  const elRect = el.getBoundingClientRect()
  if (elementHighlight) {
    elementHighlight.style.left = elRect.left + 'px'
    elementHighlight.style.top = elRect.top + 'px'
    elementHighlight.style.width = elRect.width + 'px'
    elementHighlight.style.height = elRect.height + 'px'
    elementHighlight.style.display = 'block'
  }

  const srcParts = selectedPatchlySrc ? selectedPatchlySrc.split(':') : null
  const fileName = srcParts ? srcParts[0].split('/').pop() : el.tagName.toLowerCase()
  if (componentLabel) {
    componentLabel.textContent = fileName ?? ''
    componentLabel.style.left = elRect.left + 'px'
    componentLabel.style.top = (elRect.top - 22) + 'px'
    componentLabel.style.display = 'block'
  }

  const selRect = rect || getSelectionRect()
  const promptY = Math.min(selRect.y + selRect.height + 8, window.innerHeight - 60)
  if (promptBar) {
    promptBar.style.left = selRect.x + 'px'
    promptBar.style.top = promptY + 'px'
    promptBar.style.display = 'flex'
  }

  setTimeout(() => promptInput?.focus(), 50)
}

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
      const r = c.el.getBoundingClientRect()
      if (elementHighlight) {
        elementHighlight.style.left = r.left + 'px'
        elementHighlight.style.top = r.top + 'px'
        elementHighlight.style.width = r.width + 'px'
        elementHighlight.style.height = r.height + 'px'
        elementHighlight.style.display = 'block'
      }
    })
    row.addEventListener('click', () => {
      hidePicker()
      selectedTargets = null
      selectElement(c.el, rect)
    })
  })

  picker.querySelector('.patchly-picker-apply')!.addEventListener('click', () => {
    const chosen = checked()
    if (chosen.length === 0) return
    hidePicker()
    if (chosen.length === 1) {
      selectedTargets = null
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
  if (elementHighlight) elementHighlight.style.display = 'none'

  if (componentLabel) {
    componentLabel.textContent = `${candidates.length} components`
    componentLabel.style.left = rect.x + 'px'
    componentLabel.style.top = Math.max(2, rect.y - 22) + 'px'
    componentLabel.style.display = 'block'
  }

  const promptY = Math.min(rect.y + rect.height + 8, window.innerHeight - 60)
  if (promptBar) {
    promptBar.style.left = rect.x + 'px'
    promptBar.style.top = promptY + 'px'
    promptBar.style.display = 'flex'
  }
  setTimeout(() => promptInput?.focus(), 50)
}

function hidePicker(): void {
  const picker = document.getElementById('patchly-picker')
  if (picker) picker.style.display = 'none'
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
  if (!prompt) {
    promptInput.focus()
    return
  }

  if (!selectedElement && !selectedTargets) {
    console.log('[Patchly] No element selected')
    return
  }

  if (selectedTargets && selectedTargets.length > 1) {
    const targets = selectedTargets
      .filter((el) => (el as HTMLElement).dataset.patchlySrc)
      .map((el) => ({
        patchlySrc: (el as HTMLElement).dataset.patchlySrc,
        elementHtml: el.outerHTML.slice(0, 500),
        elementClasses: (el as HTMLElement).className || '',
        screenshot_base64: null,
      }))

    const payload = {
      prompt,
      sessionId: Math.random().toString(36).slice(2),
      targets,
    }

    console.log(`[Patchly] Batch edit request (${targets.length} targets)`)

    if (window.__patchlySend) {
      window.__patchlySend(payload as Record<string, unknown>)
      if (promptBar) promptBar.style.display = 'none'
      promptInput.value = ''
      if (componentLabel) componentLabel.style.display = 'none'
      showLoadingPanel()
    }
    return
  }

  if (selectedElement) {
    await sendSingleEdit(selectedElement, selectedPatchlySrc, prompt)
  }
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

  console.log('[Patchly] Edit request (screenshot:', screenshot_base64 ? 'captured' : 'none', ')')

  if (window.__patchlySend) {
    window.__patchlySend(payload)
    if (promptBar) promptBar.style.display = 'none'
    if (promptInput) {
      promptInput.value = ''
      promptInput.disabled = false
    }
    const submitBtn = document.getElementById('patchly-prompt-submit') as HTMLButtonElement | null
    if (submitBtn) {
      submitBtn.textContent = 'Apply'
      submitBtn.disabled = false
      submitBtn.style.background = ''
    }
    showLoadingPanel()
  } else {
    console.warn('[Patchly] __patchlySend not available')
  }
}

function resetPromptBar(): void {
  const submitBtn = document.getElementById('patchly-prompt-submit') as HTMLButtonElement | null
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

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

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
    if (okEdits.length) {
      window.__patchlySendToAgent?.({ type: 'PATCHLY_CONFIRM', sessionId })
    }
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

// ─── Edit history sidebar ─────────────────────────────────────────────────────

const PATCHLY_HISTORY_KEY = 'patchly_edits'
let historyInited = false

interface HistoryEntry {
  editId: string
  filePath: string
  lineNumber?: number
  explanation?: string
  ts: number
  undone?: boolean
}

function readHistory(): Promise<HistoryEntry[]> {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.get({ [PATCHLY_HISTORY_KEY]: [] }, (res) => {
        resolve(chrome.runtime.lastError ? [] : ((res[PATCHLY_HISTORY_KEY] as HistoryEntry[]) || []))
      })
    } catch {
      resolve([])
    }
  })
}

function ensureHistoryUI(): void {
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
  ;(panel.querySelector('.patchly-hist-close') as HTMLButtonElement).onclick = closeHistory
}

function relativeTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

async function renderHistory(): Promise<void> {
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

  list.querySelectorAll<HTMLElement>('.patchly-hist-row').forEach((row) => {
    const editId = row.getAttribute('data-edit-id')
    const btn = row.querySelector('.patchly-hist-undo') as HTMLButtonElement | null
    if (btn && !btn.disabled) {
      btn.onclick = () => {
        window.__patchlySendToAgent?.({ type: 'PATCHLY_UNDO', editId })
      }
    }
  })
}

function openHistory(): void {
  ensureHistoryUI()
  const panel = document.getElementById('patchly-history')
  if (panel) panel.classList.add('open')
  void renderHistory()
}

function closeHistory(): void {
  const panel = document.getElementById('patchly-history')
  if (panel) panel.classList.remove('open')
}

window.__patchlyRenderHistory = renderHistory
window.__patchlyOpenHistory = openHistory
