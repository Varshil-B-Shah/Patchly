# Phase 2 — Visual Selection Layer
> Prerequisite: Phase 1 pass criteria all met.
> Goal: User can activate Patchly, draw a selection box over any area, see it highlighted, and type a prompt. Nothing submits yet.
> Estimated time: 4–5 days

---

## What This Phase Builds

By the end of Phase 2:
- `Alt+Shift+P` activates selection mode
- Cursor becomes crosshair
- User can rubber-band drag a selection rectangle over any area
- Most specific DOM element within that area gets highlighted
- A floating prompt bar appears below the selection
- User can type in the prompt bar
- `Esc` cancels everything cleanly
- `Enter` in prompt bar logs the payload to console (actual submission in Phase 4)

No LLM calls. No file writes. Pure UI layer.

---

## New Files To Create

```
extension/
├── overlay.js          ← NEW: all selection UI logic
├── overlay.css         ← NEW: styles for overlay elements
└── content.js          ← MODIFY: import overlay, add keyboard listener
```

---

## How The Selection Works

```
User presses Alt+Shift+P
        ↓
Selection mode activates (cursor: crosshair, overlay div injected)
        ↓
User mousedown → records startX, startY
        ↓
User mousemove → draws live rubber-band rect
        ↓
User mouseup → finalizes rect coords
        ↓
Find most specific element at center of selection
        ↓
Highlight that element with blue border
        ↓
Show prompt bar just below the selection rect
        ↓
User types prompt → Enter → log payload to console
   or  Esc → cancel everything
```

---

## `extension/overlay.css`

```css
/* All Patchly overlay elements use this class prefix to avoid conflicts */

#patchly-root {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2147483647; /* max z-index */
  pointer-events: none; /* passthrough by default */
}

#patchly-root.active {
  pointer-events: all;
  cursor: crosshair;
}

/* The rubber-band selection rectangle */
#patchly-selection-rect {
  position: fixed;
  border: 2px dashed #6366f1;
  background: rgba(99, 102, 241, 0.08);
  pointer-events: none;
  display: none;
  box-sizing: border-box;
}

/* The blue highlight on the most specific element */
#patchly-element-highlight {
  position: fixed;
  border: 2px solid #6366f1;
  background: rgba(99, 102, 241, 0.12);
  pointer-events: none;
  display: none;
  box-sizing: border-box;
  border-radius: 3px;
  transition: all 0.1s ease;
}

/* The floating prompt bar */
#patchly-prompt-bar {
  position: fixed;
  display: none;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 8px 10px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
  z-index: 2147483647;
  min-width: 320px;
  max-width: 480px;
  pointer-events: all;
}

#patchly-prompt-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1a1a1a;
  background: transparent;
  caret-color: #6366f1;
}

#patchly-prompt-input::placeholder {
  color: #aaa;
}

#patchly-prompt-submit {
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

#patchly-prompt-submit:hover {
  background: #4f46e5;
}

#patchly-prompt-cancel {
  background: none;
  border: none;
  color: #999;
  font-size: 18px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

/* Small label showing which component was detected */
#patchly-component-label {
  position: fixed;
  display: none;
  background: #6366f1;
  color: white;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 2px 7px;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
}
```

---

## `extension/overlay.js`

```js
// extension/overlay.js
// Handles all visual selection UI
// No imports — this is injected as a plain script

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
  if (document.getElementById('patchly-root')) return // already initialized

  // Inject CSS
  const style = document.createElement('link')
  style.rel = 'stylesheet'
  // CSS is injected differently — see content.js
  // For now inline critical styles

  // Create root overlay
  root = document.createElement('div')
  root.id = 'patchly-root'
  document.body.appendChild(root)

  // Selection rectangle
  selectionRect = document.createElement('div')
  selectionRect.id = 'patchly-selection-rect'
  document.body.appendChild(selectionRect)

  // Element highlight
  elementHighlight = document.createElement('div')
  elementHighlight.id = 'patchly-element-highlight'
  document.body.appendChild(elementHighlight)

  // Component label
  componentLabel = document.createElement('div')
  componentLabel.id = 'patchly-component-label'
  document.body.appendChild(componentLabel)

  // Prompt bar
  promptBar = document.createElement('div')
  promptBar.id = 'patchly-prompt-bar'
  promptBar.innerHTML = `
    <input id="patchly-prompt-input" type="text" placeholder="Describe what to change..." autocomplete="off" />
    <button id="patchly-prompt-submit">Apply</button>
    <button id="patchly-prompt-cancel">×</button>
  `
  document.body.appendChild(promptBar)

  promptInput = document.getElementById('patchly-prompt-input')

  document.getElementById('patchly-prompt-submit').addEventListener('click', submitPrompt)
  document.getElementById('patchly-prompt-cancel').addEventListener('click', cancel)

  // Mouse events on root overlay
  root.addEventListener('mousedown', onMouseDown)
  root.addEventListener('mousemove', onMouseMove)
  root.addEventListener('mouseup', onMouseUp)

  // Keyboard
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

  // Hide prompt bar if it was showing from a previous selection
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

  // Ignore tiny selections (accidental clicks)
  if (rect.width < 5 || rect.height < 5) {
    cancel()
    return
  }

  // Find the most specific element in the selection
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
  // Temporarily hide Patchly overlays so they don't get selected
  root.style.display = 'none'
  selectionRect.style.display = 'none'
  elementHighlight.style.display = 'none'

  // Sample points within the selection to find elements
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2

  // Get all elements at the center point
  const elements = document.elementsFromPoint(centerX, centerY)

  // Restore overlays
  root.style.display = ''
  selectionRect.style.display = 'block'
  elementHighlight.style.display = 'none'

  // Filter: ignore html, body, Patchly's own elements, and script/style tags
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

  // Take the most specific (first = deepest in DOM)
  selectedElement = candidates[0]
  selectedPatchlySrc = selectedElement.dataset.patcklySrc || null

  // Show highlight
  const elRect = selectedElement.getBoundingClientRect()
  elementHighlight.style.left = elRect.left + 'px'
  elementHighlight.style.top = elRect.top + 'px'
  elementHighlight.style.width = elRect.width + 'px'
  elementHighlight.style.height = elRect.height + 'px'
  elementHighlight.style.display = 'block'

  // Show component label above the highlight
  const srcParts = selectedPatchlySrc ? selectedPatchlySrc.split(':') : null
  const fileName = srcParts ? srcParts[0].split('/').pop() : selectedElement.tagName.toLowerCase()
  componentLabel.textContent = fileName
  componentLabel.style.left = elRect.left + 'px'
  componentLabel.style.top = (elRect.top - 22) + 'px'
  componentLabel.style.display = 'block'

  // Show prompt bar below the selection rect
  const selRect = getSelectionRect()
  const promptY = Math.min(selRect.y + selRect.height + 8, window.innerHeight - 60)
  promptBar.style.left = selRect.x + 'px'
  promptBar.style.top = promptY + 'px'
  promptBar.style.display = 'flex'

  // Focus the input
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

  // Build the payload that will go to the agent in Phase 4
  const payload = {
    patchlySrc: selectedPatchlySrc,
    elementHtml: selectedElement.outerHTML.slice(0, 500),
    elementClasses: selectedElement.className || '',
    elementTag: selectedElement.tagName.toLowerCase(),
    prompt: prompt,
    sessionId: Math.random().toString(36).slice(2),
  }

  // Phase 2: just log it — Phase 4 will send it to the agent
  console.log('[Patchly] Edit request payload:', payload)
  console.log('[Patchly] patchlySrc:', payload.patchlySrc || '⚠️ NOT FOUND — source mapping not working')

  // Show a temporary "sent" state
  const submitBtn = document.getElementById('patchly-prompt-submit')
  submitBtn.textContent = '✓ Logged'
  submitBtn.style.background = '#22c55e'
  setTimeout(() => cancel(), 1000)
}

// Export activate and cancel for content.js to call
window.__patchlyActivate = activate
window.__patchlyCancel = cancel
```

---

## Modifications to `extension/content.js`

Add to the bottom of the existing `content.js`:

```js
// Inject overlay.css
const overlayCSS = document.createElement('link')
overlayCSS.rel = 'stylesheet'
// Note: In MV3, use chrome.runtime.getURL for extension files
// The CSS will be injected via scripting API — see background.js

// Listen for keyboard shortcut Alt+Shift+P
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.shiftKey && e.key === 'P') {
    e.preventDefault()
    if (window.__patchlyActivate) {
      window.__patchlyActivate()
    }
  }
  if (e.key === 'Escape' && window.__patchlyCancel) {
    window.__patchlyCancel()
  }
})

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected })
  }
  if (msg.type === 'ACTIVATE_PATCHLY') {
    if (window.__patchlyActivate) window.__patchlyActivate()
  }
})
```

---

## Injecting overlay.js and overlay.css

In MV3, content scripts declared in manifest run automatically, but additional scripts need to be injected. The simplest approach for Phase 2: add `overlay.js` and `overlay.css` to the manifest's `content_scripts`:

Update `manifest.json` content_scripts section:
```json
"content_scripts": [
  {
    "matches": ["http://localhost/*", "http://127.0.0.1/*"],
    "js": ["content.js", "overlay.js"],
    "css": ["overlay.css"],
    "run_at": "document_idle"
  }
]
```

---

## Phase 2 Tasks Checklist

- [ ] Create `extension/overlay.js` with full code above
- [ ] Create `extension/overlay.css` with full styles above
- [ ] Update `extension/content.js` with keyboard listener additions
- [ ] Update `manifest.json` to include overlay.js and overlay.css in content_scripts
- [ ] Reload extension in `chrome://extensions`
- [ ] Open test app on localhost
- [ ] Press `Alt+Shift+P` — cursor should change to crosshair
- [ ] Draw a box over a component — blue dashed rect appears while dragging
- [ ] Release mouse — selected element gets solid blue highlight, component label appears
- [ ] Prompt bar appears below the selection
- [ ] Type a prompt, press Enter — check browser console for payload log
- [ ] Verify `patchlySrc` in the logged payload is NOT undefined (requires Phase 0 plugin to be active)
- [ ] Press `Esc` — everything clears cleanly

---

## Phase 2 Pass Criteria

- [ ] `Alt+Shift+P` activates selection mode reliably
- [ ] Rubber-band rectangle draws correctly during drag
- [ ] Selected element is highlighted with blue border
- [ ] Component filename label appears above highlight
- [ ] Prompt bar appears below selection
- [ ] Console log shows correct `patchlySrc` value (e.g. `src/components/Hero.jsx:5:4`)
- [ ] `Esc` cancels everything with no leftover DOM elements
- [ ] No console errors during normal usage

---

## Important Note on `data-patchly-src` attribute name

In `overlay.js` the code reads `selectedElement.dataset.patcklySrc`.

In JavaScript, `dataset` converts `data-patchly-src` → `patclySrc` (camelCase, hyphens removed).

Double check: `data-patchly-src` in HTML → `dataset.patclySrc` in JS. If this is wrong the `patchlySrc` in your payload will be undefined. This is a common gotcha.

Proceed to Phase 3 only when all pass criteria are met.
