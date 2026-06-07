# Phase 6 — Polish, Error Handling & README
> Prerequisite: Phase 5 pass criteria all met. Full loop works end-to-end.
> Goal: Make Patchly usable by someone who has never spoken to you. Clean README, handled errors, zero-friction setup.
> Estimated time: 3–4 days

---

## What This Phase Builds

The product works, but right now only you can use it because you know all the quirks. Phase 6 makes it work for a stranger who finds it on GitHub. By end of Phase 6:

- Every error state shows a clear, actionable message — no raw stack traces
- `npx patchly init` is fully polished and prints exactly what the user needs to do
- README has a GIF, 3-step quick start, and nothing else in the way
- Loading state in the prompt bar during LLM call
- Keyboard shortcuts all work cleanly
- Extension popup has settings for Azure credentials (no manual JSON editing needed)
- Ready for GitHub public release

---

## 1. Complete Error Handling Audit

Go through every error code defined in `shared/protocol.js` and `fileEditor.js` and verify each one shows a helpful message in the extension. The user should never see a raw error code.

| Error code | User-facing message to show |
|---|---|
| `NO_CREDENTIALS` | "Add your Azure API key in the Patchly settings (click the extension icon)." |
| `SOURCE_NOT_FOUND` | "Could not find source file. Make sure patchlyPlugin() is in your vite.config.js and your dev server is restarted." |
| `NO_SOURCE_ATTR` | "This element has no source info. Try clicking a more specific element inside the area." |
| `LLM_API_ERROR` | "Azure API error. Check your endpoint URL and API key in settings." |
| `LLM_CANNOT_EDIT` | Show the LLM's explanation directly — it explains why. |
| `NOT_FOUND` | "The code may have changed since the edit was generated. Please try again." |
| `AMBIGUOUS_MATCH` | "Multiple matching elements found. Try selecting a more specific element." |
| `FILE_TOO_LARGE` | "This file is too large for Patchly to edit safely." |
| `NETWORK_ERROR` | "Could not reach Azure. Check your internet connection." |
| `NOTHING_TO_UNDO` | "Nothing to undo." |

---

## 2. Loading State in Prompt Bar

When the user presses Enter/Apply, the prompt bar should show a loading state while the agent processes. Currently it just dismisses. Fix this:

In `overlay.js`, in the `submitPrompt` function:

```js
function submitPrompt() {
  const prompt = promptInput.value.trim()
  if (!prompt) { promptInput.focus(); return }

  // Show loading state
  const submitBtn = document.getElementById('patchly-prompt-submit')
  submitBtn.textContent = '...'
  submitBtn.disabled = true
  submitBtn.style.background = '#818cf8'
  promptInput.disabled = true

  // Send to agent
  if (window.__patchlySendToAgent) {
    window.__patchlySendToAgent({
      type: 'PATCHLY_EDIT_REQUEST',
      patchlySrc: selectedPatchlySrc,
      elementHtml: selectedElement.outerHTML.slice(0, 500),
      elementClasses: selectedElement.className || '',
      elementTag: selectedElement.tagName.toLowerCase(),
      prompt,
      sessionId: Math.random().toString(36).slice(2),
    })
  }

  // Hide the selection UI — keep prompt bar visible in loading state
  if (selectionRect) selectionRect.style.display = 'none'
  if (elementHighlight) elementHighlight.style.display = 'none'
  if (componentLabel) componentLabel.style.display = 'none'
}
```

The prompt bar dismisses when the PREVIEW message arrives (Phase 4) or EDIT_ERROR (show error). Add cleanup in both cases.

---

## 3. Settings Screen in Popup

Currently Azure credentials are set via `.patchlyrc.json`. Non-developers won't edit a JSON file. Add a settings form to the popup.

Update `extension/popup/popup.html` — add a settings section:

```html
<!-- Add after existing content in popup.html -->
<div id="settings-section" style="margin-top:12px">
  <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">
    Azure Settings
  </div>

  <div style="margin-bottom:8px">
    <label style="font-size:11px;color:#666;display:block;margin-bottom:3px">Endpoint URL</label>
    <input id="azure-endpoint" type="text" placeholder="https://your-resource.openai.azure.com"
      style="width:100%;box-sizing:border-box;border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:12px;outline:none;font-family:inherit"/>
  </div>

  <div style="margin-bottom:8px">
    <label style="font-size:11px;color:#666;display:block;margin-bottom:3px">API Key</label>
    <input id="azure-key" type="password" placeholder="••••••••••••"
      style="width:100%;box-sizing:border-box;border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:12px;outline:none;font-family:inherit"/>
  </div>

  <div style="margin-bottom:10px">
    <label style="font-size:11px;color:#666;display:block;margin-bottom:3px">Model</label>
    <select id="azure-model"
      style="width:100%;box-sizing:border-box;border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:12px;outline:none;font-family:inherit;background:#fff">
      <option value="gpt-4o">gpt-4o</option>
      <option value="gpt-4o-mini">gpt-4o-mini</option>
      <option value="gpt-4-turbo">gpt-4-turbo</option>
    </select>
  </div>

  <button id="save-settings"
    style="width:100%;background:#6366f1;color:#fff;border:none;border-radius:7px;padding:8px;font-size:13px;cursor:pointer;font-family:inherit">
    Save
  </button>

  <div id="save-status" style="text-align:center;font-size:11px;color:#22c55e;margin-top:6px;display:none">
    Saved ✓
  </div>
</div>
```

Update `extension/popup/popup.js` to load and save settings:

```js
// Load saved settings on popup open
chrome.storage.local.get(['azureEndpoint', 'azureKey', 'azureModel'], (data) => {
  if (data.azureEndpoint) document.getElementById('azure-endpoint').value = data.azureEndpoint
  if (data.azureKey) document.getElementById('azure-key').value = data.azureKey
  if (data.azureModel) document.getElementById('azure-model').value = data.azureModel
})

document.getElementById('save-settings').onclick = () => {
  const settings = {
    azureEndpoint: document.getElementById('azure-endpoint').value.trim(),
    azureKey: document.getElementById('azure-key').value.trim(),
    azureModel: document.getElementById('azure-model').value,
  }
  chrome.storage.local.set(settings, () => {
    const status = document.getElementById('save-status')
    status.style.display = 'block'
    setTimeout(() => status.style.display = 'none', 2000)
  })
}
```

The agent reads these from the extension's storage. Since the agent can't access Chrome storage directly, `content.js` forwards the settings to the agent when it connects:

```js
// In content.js — after WebSocket connection is established:
ws.onopen = () => {
  // Send ping
  ws.send(JSON.stringify({ type: 'PATCHLY_PING' }))

  // Forward settings from Chrome storage to agent
  chrome.storage.local.get(['azureEndpoint', 'azureKey', 'azureModel'], (data) => {
    if (data.azureEndpoint || data.azureKey) {
      ws.send(JSON.stringify({
        type: 'PATCHLY_SETTINGS',
        azureEndpoint: data.azureEndpoint,
        azureApiKey: data.azureKey,
        model: data.azureModel || 'gpt-4o',
      }))
    }
  })
}
```

In `agent/server.js`, handle `PATCHLY_SETTINGS`:
```js
if (msg.type === 'PATCHLY_SETTINGS') {
  // Merge into config (extension settings override .patchlyrc.json)
  if (msg.azureEndpoint) config.azureEndpoint = msg.azureEndpoint
  if (msg.azureApiKey) config.azureApiKey = msg.azureApiKey
  if (msg.model) config.model = msg.model
  console.log('Settings updated from extension')
}
```

---

## 4. `npx patchly init` Final Polish

Make sure the init command:
- Detects if `patchlyPlugin()` is already in `vite.config.js` and says so instead of repeating the instruction
- Adds `.patchlyrc.json` and `.patchly.bak` to `.gitignore` automatically
- Works from any directory, not just project root

```js
// Add to bin/init.js

function updateGitignore(projectRoot) {
  const gitignorePath = path.resolve(projectRoot, '.gitignore')
  const entries = ['.patchlyrc.json', '*.patchly.bak']

  if (!fs.existsSync(gitignorePath)) return

  let content = fs.readFileSync(gitignorePath, 'utf8')
  let changed = false

  for (const entry of entries) {
    if (!content.includes(entry)) {
      content += `\n${entry}`
      changed = true
    }
  }

  if (changed) {
    fs.writeFileSync(gitignorePath, content)
    console.log('Updated .gitignore')
  }
}
```

---

## 5. README.md

The README is your product's homepage. Keep it short. Developers decide in 30 seconds.

```markdown
# 🩹 Patchly

**Select any area of your running localhost app. Describe the change. Watch the code update.**

No hunting through files. No searching for classNames. Just point and fix.

[GIF GOES HERE — record this last, after everything works]

---

## Quick start (2 steps)

**1. In your React+Vite project:**
\```bash
npx patchly init
\```
Follow the one-line instruction it prints to update your `vite.config.js`.

**2. Install the Chrome extension:**
[Download from Chrome Web Store](#) · Or load unpacked from the `extension/` folder.

---

## Usage

1. Run `npx patchly` in your project folder
2. Open your app at `http://localhost:5173`
3. Press `Alt+Shift+P` to activate
4. Draw a box around anything you want to change
5. Describe the change in plain English
6. Click Apply — your code updates, browser reloads

Press `Ctrl+Z` or click Undo in the toast to revert.

---

## Requirements

- React + Vite + Tailwind CSS
- Node.js 18+
- Chrome browser
- Azure OpenAI API key (add in extension settings)

---

## How it works

Patchly instruments your JSX at dev-server startup to tag every element with its source location. When you select an element, Patchly finds the exact line in your source file, sends it to the LLM with your instruction, and applies the returned change directly to the file. Vite picks up the change and hot reloads.

Your code stays on your machine. Your API key stays on your machine. Zero telemetry.

---

## Status

v0.1.0 — React + Vite + Tailwind. Early release.
[Report issues →](#)
```

---

## 6. Final Pre-Release Checklist

Go through this before making the GitHub repo public:

**Code quality:**
- [ ] No hardcoded secrets anywhere (check with `grep -r "api-key\|apiKey\|sk-" . --include="*.js"`)
- [ ] `.patchlyrc.json` in `.gitignore`
- [ ] `*.patchly.bak` in `.gitignore`
- [ ] `node_modules` in `.gitignore`
- [ ] No `console.log` debug spam in production paths (keep agent terminal logs, remove browser console spam)

**User experience:**
- [ ] `Alt+Shift+P` activates reliably on first try
- [ ] Selection works on elements at any depth
- [ ] Prompt bar input is focused automatically
- [ ] Loading state shows during LLM call
- [ ] Preview toast is readable and clearly shows what will change
- [ ] Success toast auto-dismisses
- [ ] Error messages are human-readable, not error codes
- [ ] Undo works within the same agent session

**Setup flow:**
- [ ] `npx patchly init` works from project root
- [ ] Instructions printed are copy-pasteable
- [ ] Azure credentials saved from popup persist across sessions
- [ ] Agent starts cleanly with `npx patchly`

**Safety:**
- [ ] No writes outside `projectRoot`
- [ ] No writes to `node_modules`, `.env`, `package.json`, or config files
- [ ] Backup always created before write
- [ ] Production builds have zero Patchly code injected

**README:**
- [ ] GIF recorded showing full workflow
- [ ] Quick start is 2 steps maximum
- [ ] Requirements listed clearly
- [ ] Link to issues

---

## Phase 6 Pass Criteria

- [ ] A developer who has never heard of Patchly can set it up and use it within 5 minutes following only the README
- [ ] Every error state produces a helpful message, not a crash or raw error code
- [ ] Azure credentials can be set from the popup without touching `.patchlyrc.json`
- [ ] GitHub repo is public-ready

**V1 is complete. Ship it.**
