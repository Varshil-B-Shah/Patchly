# Phase 1 — Foundation & Setup
> Prerequisite: Phase 0 spike passed all 5 criteria.
> Goal: Real project skeleton in place. Extension loads. Agent runs. They talk to each other.
> Estimated time: 3–4 days

---

## What This Phase Builds

By the end of Phase 1 you will have:
- The real `patchly/` monorepo created
- Chrome extension that loads on localhost tabs (does nothing visible yet)
- Local Node.js agent that starts with `npx patchly`
- WebSocket connection between extension and agent confirmed working
- Extension popup showing green dot (connected) or red dot (agent not running)

No UI overlay yet. No LLM. No file writing. Just the skeleton that everything else plugs into.

---

## Exact Folder Structure To Create

```
patchly/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   └── assets/
│       └── icons/
│           ├── icon16.png
│           ├── icon48.png
│           └── icon128.png
│
├── agent/
│   ├── index.js
│   ├── server.js
│   └── config.js
│
├── shared/
│   └── protocol.js
│
├── package.json
└── README.md
```

---

## Starter Code — Use These Exactly

### `shared/protocol.js`
This file is the contract between extension and agent. Both sides import from here. Define it once, never duplicate it.

```js
// shared/protocol.js
// Message types for extension ↔ agent communication
// Both sides must use these exact strings — no magic strings elsewhere

export const MSG = {
  // Extension → Agent
  PING:         'PATCHLY_PING',
  EDIT_REQUEST: 'PATCHLY_EDIT_REQUEST',
  UNDO:         'PATCHLY_UNDO',

  // Agent → Extension
  PONG:         'PATCHLY_PONG',
  EDIT_DONE:    'PATCHLY_EDIT_DONE',
  EDIT_ERROR:   'PATCHLY_EDIT_ERROR',
  STATUS:       'PATCHLY_STATUS',
}

// Message shape reference (not enforced in v1, just documentation)
// EDIT_REQUEST payload:
// {
//   type: MSG.EDIT_REQUEST,
//   patchlySrc: string,        // "src/components/Hero.jsx:5:4"
//   elementHtml: string,       // outerHTML of selected element (max 500 chars)
//   elementClasses: string,    // className string
//   prompt: string,            // user's natural language instruction
//   sessionId: string,         // random ID for this edit session
// }

// EDIT_DONE payload:
// {
//   type: MSG.EDIT_DONE,
//   sessionId: string,
//   find: string,              // what was replaced
//   replace: string,           // what it was replaced with
//   filePath: string,          // absolute path of edited file
//   explanation: string,       // one sentence from LLM
// }

// EDIT_ERROR payload:
// {
//   type: MSG.EDIT_ERROR,
//   sessionId: string,
//   code: string,              // 'SOURCE_NOT_FOUND' | 'LLM_FAILED' | 'FILE_WRITE_FAILED' | 'AMBIGUOUS_MATCH'
//   message: string,           // human readable
// }
```

---

### `extension/manifest.json`
Chrome MV3 is strict. Use this exactly — wrong permissions cause silent failures.

```json
{
  "manifest_version": 3,
  "name": "Patchly",
  "version": "0.1.0",
  "description": "Select any UI area on localhost, describe the change, watch the code update.",

  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "tabs"
  ],

  "host_permissions": [
    "http://localhost/*",
    "http://127.0.0.1/*"
  ],

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["http://localhost/*", "http://127.0.0.1/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16":  "assets/icons/icon16.png",
      "48":  "assets/icons/icon48.png",
      "128": "assets/icons/icon128.png"
    }
  },

  "icons": {
    "16":  "assets/icons/icon16.png",
    "48":  "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

**Important notes on manifest:**
- `"type": "module"` on background.js allows ES module imports
- `content_scripts` auto-injects `content.js` into all localhost tabs — no manual injection needed
- `host_permissions` must include both `localhost` and `127.0.0.1`

---

### `agent/index.js`
Entry point. This is what `npx patchly` runs.

```js
#!/usr/bin/env node
// agent/index.js

import { startServer } from './server.js'
import { loadConfig } from './config.js'

const PORT = 7842  // fixed port — extension hardcodes this too

async function main() {
  console.log('🩹 Patchly agent starting...')

  const config = await loadConfig()

  if (!config.projectRoot) {
    console.error('❌ No project root found. Run `npx patchly init` first.')
    process.exit(1)
  }

  await startServer(PORT, config)
  console.log(`✅ Patchly agent running on ws://localhost:${PORT}`)
  console.log(`   Project root: ${config.projectRoot}`)
  console.log(`   Open your localhost app and activate Patchly with Alt+Shift+P`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
```

---

### `agent/server.js`
WebSocket server. Keep it minimal in Phase 1 — just handle ping/pong.

```js
// agent/server.js
import { WebSocketServer } from 'ws'
import { MSG } from '../shared/protocol.js'

export async function startServer(port, config) {
  const wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    console.log('Extension connected')

    // Send status immediately on connect
    ws.send(JSON.stringify({
      type: MSG.STATUS,
      connected: true,
      projectRoot: config.projectRoot,
    }))

    ws.on('message', (data) => {
      let msg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        console.error('Invalid JSON from extension')
        return
      }

      console.log('Received:', msg.type)

      // Phase 1: only handle ping
      if (msg.type === MSG.PING) {
        ws.send(JSON.stringify({ type: MSG.PONG }))
      }

      // EDIT_REQUEST handler added in Phase 4
    })

    ws.on('close', () => {
      console.log('Extension disconnected')
    })
  })

  return wss
}
```

---

### `agent/config.js`
Reads `.patchlyrc.json` from the current working directory.

```js
// agent/config.js
import fs from 'fs'
import path from 'path'

const CONFIG_FILE = '.patchlyrc.json'

export async function loadConfig() {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE)

  if (!fs.existsSync(configPath)) {
    return { projectRoot: null }
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    console.error(`Could not read ${CONFIG_FILE}`)
    return { projectRoot: null }
  }
}

export async function saveConfig(data) {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE)
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2))
}
```

---

### `extension/content.js`
Injected into all localhost tabs. Phase 1: just connect to agent and confirm.

```js
// extension/content.js
// NOTE: content scripts cannot use ES module imports
// Use plain variables, no import/export

const AGENT_PORT = 7842
const MSG_PING = 'PATCHLY_PING'
const MSG_PONG = 'PATCHLY_PONG'
const MSG_STATUS = 'PATCHLY_STATUS'

let ws = null
let isConnected = false

function connect() {
  try {
    ws = new WebSocket(`ws://localhost:${AGENT_PORT}`)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: MSG_PING }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === MSG_PONG || msg.type === MSG_STATUS) {
        isConnected = true
        // Notify popup of connection status
        chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: true })
      }
    }

    ws.onclose = () => {
      isConnected = false
      chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: false })
      // Retry connection every 3 seconds
      setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      isConnected = false
    }

  } catch (e) {
    setTimeout(connect, 3000)
  }
}

// Start connecting when page loads
connect()
```

---

### `extension/popup/popup.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      width: 280px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      margin: 0;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .logo {
      font-weight: 600;
      font-size: 15px;
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: #f5f5f5;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot.connected { background: #22c55e; }
    .dot.disconnected { background: #ef4444; }
    .status-text { color: #555; }
    .hint {
      font-size: 12px;
      color: #888;
      line-height: 1.5;
    }
    .hint code {
      background: #f0f0f0;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11px;
    }
    .shortcut {
      margin-top: 12px;
      padding: 8px 12px;
      background: #f0f0ff;
      border-radius: 8px;
      font-size: 12px;
      color: #4f46e5;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="logo">🩹 Patchly</span>
  </div>

  <div class="status-row">
    <div class="dot disconnected" id="status-dot"></div>
    <span class="status-text" id="status-text">Agent not running</span>
  </div>

  <div class="hint" id="hint-text">
    Run <code>npx patchly</code> in your project folder to start the agent.
  </div>

  <div class="shortcut" id="shortcut" style="display:none">
    Press <strong>Alt+Shift+P</strong> to select an area
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

---

### `extension/popup/popup.js`

```js
// extension/popup/popup.js

const dot = document.getElementById('status-dot')
const statusText = document.getElementById('status-text')
const hintText = document.getElementById('hint-text')
const shortcut = document.getElementById('shortcut')

function setConnected(connected) {
  if (connected) {
    dot.className = 'dot connected'
    statusText.textContent = 'Agent connected'
    hintText.textContent = 'Open your localhost app and activate Patchly.'
    shortcut.style.display = 'block'
  } else {
    dot.className = 'dot disconnected'
    statusText.textContent = 'Agent not running'
    hintText.innerHTML = 'Run <code>npx patchly</code> in your project folder to start the agent.'
    shortcut.style.display = 'none'
  }
}

// Ask the active tab's content script for current status
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return
  chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      setConnected(false)
      return
    }
    setConnected(response?.connected ?? false)
  })
})

// Listen for real-time status updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AGENT_STATUS') {
    setConnected(msg.connected)
  }
})
```

---

### `package.json`

```json
{
  "name": "patchly",
  "version": "0.1.0",
  "description": "Select any UI area on localhost, describe the change, watch the code update.",
  "type": "module",
  "bin": {
    "patchly": "./agent/index.js"
  },
  "scripts": {
    "agent": "node agent/index.js",
    "dev": "node --watch agent/index.js"
  },
  "dependencies": {
    "ws": "^8.16.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## Phase 1 Tasks Checklist

- [ ] Create full folder structure as shown above
- [ ] Copy all starter code files exactly as provided
- [ ] Create placeholder PNG icons (16x16, 48x48, 128x128) — solid indigo square is fine for now
- [ ] `npm install` in root
- [ ] Create a test `.patchlyrc.json` in your test project:
  ```json
  {
    "projectRoot": "/absolute/path/to/your/test-app",
    "devServerPort": 5173,
    "framework": "react-vite"
  }
  ```
- [ ] Load extension in Chrome:
  - Go to `chrome://extensions`
  - Enable Developer Mode
  - Click "Load unpacked"
  - Select the `extension/` folder
- [ ] Run `node agent/index.js` from your test project folder (where `.patchlyrc.json` is)
- [ ] Open `http://localhost:5173` in Chrome
- [ ] Click Patchly icon in toolbar → see green dot and "Agent connected"

---

## Phase 1 Pass Criteria

- [ ] `npx patchly` (or `node agent/index.js`) starts without errors
- [ ] Extension loads in Chrome without errors in `chrome://extensions`
- [ ] Opening a localhost tab → content.js connects to agent WebSocket
- [ ] Popup shows green dot when agent is running
- [ ] Popup shows red dot when agent is stopped
- [ ] No console errors in either the browser tab or the agent terminal

---

## Common Issues

**Extension not connecting to agent**
Check: is the agent actually running? Is it on port 7842? Does Chrome show any errors in the extension's service worker? Go to `chrome://extensions` → click "Service Worker" link → check console.

**`chrome.runtime.sendMessage` errors in popup**
This happens when the content script hasn't loaded yet (page still loading). Add error handling with `chrome.runtime.lastError` check — already included in the starter code above.

**`type: "module"` errors in content.js**
Content scripts do NOT support ES modules. That's why `content.js` uses plain `var`/`const` with no imports. Keep it that way throughout the project.

Proceed to Phase 2 only when all pass criteria are met.
