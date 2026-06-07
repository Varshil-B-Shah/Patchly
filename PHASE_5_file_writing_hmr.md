# Phase 5 — File Writing & HMR
> Prerequisite: Phase 4 pass criteria all met. Preview toast works.
> Goal: User clicks Apply → source file is edited → Vite hot reloads → browser updates. Undo works.
> Estimated time: 2–3 days

---

## What This Phase Builds

This is the payoff phase. Everything before it was setup. By end of Phase 5:

- User clicks Apply in the preview toast
- Agent applies the `find → replace` edit to the actual source file
- Vite detects the file change and hot reloads automatically (no extra work needed)
- Extension shows a success toast: "✓ Applied — Hero.jsx line 5" with an Undo button
- Undo restores the file from backup
- All safety checks in place: path traversal prevention, ambiguous match detection, backup before write

---

## New Files To Create

```
patchly/
└── agent/
    └── fileEditor.js     ← NEW
```

---

## `agent/fileEditor.js`

```js
// agent/fileEditor.js
// Applies a find+replace edit to a source file with safety checks

import fs from 'fs'
import path from 'path'

const BACKUP_EXTENSION = '.patchly.bak'

// Directories that must never be written to
const FORBIDDEN_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
]

// Files that must never be written to
const FORBIDDEN_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.ts',
]

export function applyEdit({ absolutePath, find, replace, projectRoot }) {
  // ── Safety checks ──

  // 1. Path must be inside projectRoot
  const resolvedPath = path.resolve(absolutePath)
  const resolvedRoot = path.resolve(projectRoot)
  if (!resolvedPath.startsWith(resolvedRoot)) {
    return {
      success: false,
      code: 'PATH_TRAVERSAL',
      message: 'Refusing to write outside project root.'
    }
  }

  // 2. No forbidden directories
  const relativePath = path.relative(resolvedRoot, resolvedPath)
  for (const forbidden of FORBIDDEN_PATHS) {
    if (relativePath.startsWith(forbidden + path.sep) || relativePath.includes(path.sep + forbidden + path.sep)) {
      return {
        success: false,
        code: 'FORBIDDEN_PATH',
        message: `Refusing to write to ${forbidden}/`
      }
    }
  }

  // 3. No forbidden files
  const fileName = path.basename(resolvedPath)
  if (FORBIDDEN_FILES.includes(fileName)) {
    return {
      success: false,
      code: 'FORBIDDEN_FILE',
      message: `Refusing to write to ${fileName}`
    }
  }

  // 4. File must exist
  if (!fs.existsSync(resolvedPath)) {
    return {
      success: false,
      code: 'FILE_NOT_FOUND',
      message: `File not found: ${resolvedPath}`
    }
  }

  // ── Read current content ──
  let content
  try {
    content = fs.readFileSync(resolvedPath, 'utf8')
  } catch (err) {
    return {
      success: false,
      code: 'READ_ERROR',
      message: `Could not read file: ${err.message}`
    }
  }

  // ── Validate find string ──
  const occurrences = content.split(find).length - 1

  if (occurrences === 0) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: `The target string was not found in the file. The code may have changed since the edit was generated. Please try again.`
    }
  }

  if (occurrences > 1) {
    return {
      success: false,
      code: 'AMBIGUOUS_MATCH',
      message: `The target string appears ${occurrences} times in the file. Cannot safely apply. Please select a more specific element.`
    }
  }

  // ── Backup ──
  const backupPath = resolvedPath + BACKUP_EXTENSION
  try {
    fs.writeFileSync(backupPath, content)
  } catch (err) {
    return {
      success: false,
      code: 'BACKUP_FAILED',
      message: `Could not create backup: ${err.message}`
    }
  }

  // ── Apply edit ──
  const newContent = content.replace(find, replace)

  try {
    fs.writeFileSync(resolvedPath, newContent, 'utf8')
  } catch (err) {
    // Restore from backup
    try { fs.writeFileSync(resolvedPath, content, 'utf8') } catch {}
    return {
      success: false,
      code: 'WRITE_ERROR',
      message: `Could not write file: ${err.message}`
    }
  }

  console.log(`✅ Applied edit to ${relativePath}`)

  return {
    success: true,
    absolutePath: resolvedPath,
    backupPath,
  }
}

export function undoEdit({ absolutePath }) {
  const resolvedPath = path.resolve(absolutePath)
  const backupPath = resolvedPath + BACKUP_EXTENSION

  if (!fs.existsSync(backupPath)) {
    return {
      success: false,
      code: 'NO_BACKUP',
      message: 'No backup found for this file. Cannot undo.'
    }
  }

  try {
    const backup = fs.readFileSync(backupPath, 'utf8')
    fs.writeFileSync(resolvedPath, backup, 'utf8')
    fs.unlinkSync(backupPath)  // clean up backup after undo
    console.log(`↩️  Undid edit to ${path.basename(resolvedPath)}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      code: 'UNDO_ERROR',
      message: `Undo failed: ${err.message}`
    }
  }
}
```

---

## Update `agent/server.js` — Handle CONFIRM and UNDO

Add to the `ws.on('message')` handler:

```js
import { applyEdit, undoEdit } from './fileEditor.js'

// Handle CONFIRM (user clicked Apply in the preview toast)
if (msg.type === MSG.CONFIRM) {
  const { sessionId } = msg
  const pending = pendingEdits.get(sessionId)

  if (!pending) {
    ws.send(JSON.stringify({
      type: MSG.EDIT_ERROR,
      sessionId,
      code: 'NO_PENDING_EDIT',
      message: 'No pending edit found for this session. It may have expired.'
    }))
    return
  }

  const editResult = applyEdit({
    absolutePath: pending.absolutePath,
    find: pending.find,
    replace: pending.replace,
    projectRoot: config.projectRoot,
  })

  pendingEdits.delete(sessionId)

  if (!editResult.success) {
    ws.send(JSON.stringify({
      type: MSG.EDIT_ERROR,
      sessionId,
      code: editResult.code,
      message: editResult.message,
    }))
    return
  }

  // Store for undo
  lastEdit = {
    absolutePath: editResult.absolutePath,
  }

  ws.send(JSON.stringify({
    type: MSG.EDIT_DONE,
    sessionId,
    filePath: path.relative(config.projectRoot, editResult.absolutePath),
  }))
}

// Handle UNDO
if (msg.type === MSG.UNDO) {
  if (!lastEdit) {
    ws.send(JSON.stringify({
      type: MSG.EDIT_ERROR,
      code: 'NOTHING_TO_UNDO',
      message: 'Nothing to undo.'
    }))
    return
  }

  const undoResult = undoEdit({ absolutePath: lastEdit.absolutePath })
  lastEdit = null

  if (!undoResult.success) {
    ws.send(JSON.stringify({
      type: MSG.EDIT_ERROR,
      code: undoResult.code,
      message: undoResult.message,
    }))
    return
  }

  ws.send(JSON.stringify({
    type: 'PATCHLY_UNDO_DONE',
  }))
}
```

Add at top of `server.js`:
```js
let lastEdit = null  // tracks the most recent edit for undo
```

Add `UNDO` to `shared/protocol.js`:
```js
UNDO: 'PATCHLY_UNDO',
UNDO_DONE: 'PATCHLY_UNDO_DONE',
```

---

## Update `extension/overlay.js` — Success Toast + Undo

```js
// Add to overlay.js

function showSuccessToast({ filePath }) {
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
      <span style="color:#16a34a;font-weight:600">✓ Applied</span>
      <span style="color:#666"> — ${filePath}</span>
    </div>
    <button id="patchly-undo-btn" style="
      background:none;border:1px solid #d1d5db;border-radius:6px;
      padding:3px 10px;font-size:12px;cursor:pointer;color:#555;
      font-family:inherit;white-space:nowrap;
    ">Undo</button>
  `

  document.body.appendChild(toast)

  document.getElementById('patchly-undo-btn').onclick = () => {
    toast.remove()
    if (window.__patchlySendToAgent) {
      window.__patchlySendToAgent({ type: 'PATCHLY_UNDO' })
    }
  }

  // Auto-dismiss after 6 seconds
  setTimeout(() => toast.remove(), 6000)
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
  setTimeout(() => toast.remove(), 8000)
}

// Expose for content.js
window.__patchlyShowSuccess = showSuccessToast
window.__patchlyShowError = showErrorToast
```

Update `content.js` message handler to handle new message types:

```js
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)

  if (msg.type === 'PATCHLY_PONG' || msg.type === 'PATCHLY_STATUS') {
    isConnected = true
    chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: true })
  }

  if (msg.type === 'PATCHLY_PREVIEW') {
    if (window.__patchlyShowPreview) window.__patchlyShowPreview(msg)
  }

  if (msg.type === 'PATCHLY_EDIT_DONE') {
    if (window.__patchlyShowSuccess) window.__patchlyShowSuccess({ filePath: msg.filePath })
  }

  if (msg.type === 'PATCHLY_EDIT_ERROR') {
    if (window.__patchlyShowError) window.__patchlyShowError(msg.message)
  }

  if (msg.type === 'PATCHLY_UNDO_DONE') {
    if (window.__patchlyShowSuccess) window.__patchlyShowSuccess({ filePath: '↩ Undone' })
  }
}
```

---

## Why HMR Works Without Extra Work

Vite watches the file system for changes. The moment `fileEditor.js` writes to the source file, Vite's watcher detects it and sends an HMR update to the browser. The browser updates just that component without a full page reload.

You do not need to trigger HMR manually. Writing the file is sufficient.

---

## Phase 5 Tasks Checklist

- [ ] Create `agent/fileEditor.js` with full code above
- [ ] Update `agent/server.js` with CONFIRM and UNDO handlers
- [ ] Add `UNDO` and `UNDO_DONE` to `shared/protocol.js`
- [ ] Add success toast and error toast to `overlay.js`
- [ ] Update `content.js` to handle all new message types
- [ ] Full end-to-end test:
  1. Start Vite dev server
  2. Start Patchly agent
  3. Open localhost in Chrome
  4. Press `Alt+Shift+P`, draw box over a button
  5. Type "make this button have a red background"
  6. Preview toast appears with explanation
  7. Click Apply
  8. Browser hot reloads — button is now red
  9. Open the source file in VS Code — className changed
  10. Success toast shows with Undo button
  11. Click Undo — button reverts to original color
  12. Open source file — original className restored
- [ ] Test error case: manually edit the target string in the source file after generating a preview, then click Apply → error toast "target string not found"
- [ ] Verify `.patchly.bak` files are cleaned up after undo

---

## Phase 5 Pass Criteria

- [ ] Apply writes the correct change to the source file
- [ ] Vite hot reloads automatically after file write
- [ ] Success toast appears with filename and Undo button
- [ ] Undo restores original file exactly
- [ ] `.patchly.bak` cleaned up after undo
- [ ] Error toast appears on all failure paths (not found, ambiguous, write error)
- [ ] No files written outside projectRoot under any circumstances

**This is the V1 MVP complete milestone.**

After Phase 5 passes, Patchly does the full loop:
select area → type prompt → preview → apply → code updated → hot reload → undo if needed.
