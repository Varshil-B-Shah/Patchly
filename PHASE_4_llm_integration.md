# Phase 4 — LLM Integration (Azure OpenAI)
> Prerequisite: Phase 3 pass criteria all met. Source mapping works reliably.
> Goal: User types a prompt, agent calls Azure OpenAI, gets back a find+replace instruction, previews it in the extension.
> Estimated time: 3–4 days

---

## What This Phase Builds

By end of Phase 4:
- Agent reads Azure credentials from `.patchlyrc.json` or env vars
- Agent sends element context + source file + user prompt to Azure OpenAI
- LLM returns a structured `{ find, replace, explanation }` JSON object
- Agent sends the explanation back to the extension
- Extension shows a preview toast: "I will: [explanation]" with Confirm / Cancel buttons
- **File is NOT written yet** — that is Phase 5. This phase ends at the preview step.

---

## New Files To Create

```
patchly/
└── agent/
    └── llm.js     ← NEW
```

---

## `agent/llm.js`

```js
// agent/llm.js
// Calls Azure OpenAI and returns a structured edit instruction

export async function getEditInstruction({ sourceResult, elementHtml, elementClasses, prompt, config }) {
  const { azureEndpoint, azureApiKey, model } = config

  // Support env vars as fallback
  const endpoint = azureEndpoint || process.env.PATCHLY_AZURE_ENDPOINT
  const apiKey = azureApiKey || process.env.PATCHLY_AZURE_KEY
  const modelName = model || 'gpt-4o'

  if (!endpoint || !apiKey) {
    return {
      success: false,
      code: 'NO_CREDENTIALS',
      message: 'Azure endpoint and API key are required. Add them to .patchlyrc.json or set PATCHLY_AZURE_ENDPOINT and PATCHLY_AZURE_KEY env vars.'
    }
  }

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt({ sourceResult, elementHtml, elementClasses, prompt })

  try {
    const url = `${endpoint}/openai/deployments/${modelName}/chat/completions?api-version=2024-02-15-preview`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.1,  // low temperature = more predictable, less creative = safer for code edits
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        code: 'LLM_API_ERROR',
        message: `Azure API error ${response.status}: ${errorText.slice(0, 200)}`
      }
    }

    const data = await response.json()
    const rawContent = data.choices?.[0]?.message?.content

    if (!rawContent) {
      return {
        success: false,
        code: 'EMPTY_RESPONSE',
        message: 'LLM returned empty response'
      }
    }

    // Parse the JSON response
    return parseEditInstruction(rawContent)

  } catch (err) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      message: `Network error calling Azure: ${err.message}`
    }
  }
}

function buildSystemPrompt() {
  return `You are a frontend code editor. You make surgical edits to React JSX files.

You will receive:
1. The full source code of a React component file
2. The line number of the element the user selected  
3. The rendered HTML of the selected element
4. A natural language instruction

You must respond with ONLY a valid JSON object. No explanation, no markdown, no backticks.
The JSON must have exactly these three fields:

{
  "find": "the exact string to find in the file — must appear exactly once",
  "replace": "the exact replacement string",
  "explanation": "one short sentence describing what changed"
}

Critical rules:
- "find" must be a substring that exists EXACTLY ONCE in the file
- "find" should be the className string or the specific JSX attribute you are changing — not the entire element
- "replace" must be valid JSX
- Use Tailwind CSS classes only — no inline styles unless the existing code uses them
- Preserve all existing indentation and whitespace exactly
- Do NOT change any logic, props, state, or imports
- Do NOT change anything outside the targeted element
- If the instruction is unclear or impossible, set "find" and "replace" to empty strings and explain in "explanation"

Example:
Input: Change the button to have a red background
Output: {"find":"bg-indigo-600 text-white","replace":"bg-red-600 text-white","explanation":"Changed button background from indigo to red"}`
}

function buildUserPrompt({ sourceResult, elementHtml, elementClasses, prompt }) {
  return `File: ${sourceResult.relativePath}
Target line: ${sourceResult.lineNumber}
Target line content: ${sourceResult.targetLine.trim()}

Selected element classes: ${elementClasses || '(none)'}

Selected element HTML:
${elementHtml.slice(0, 400)}

Full file contents:
\`\`\`jsx
${sourceResult.fullContent}
\`\`\`

User instruction: ${prompt}`
}

function parseEditInstruction(rawContent) {
  // Strip any accidental markdown wrapping the model might add despite instructions
  let cleaned = rawContent.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
  }

  try {
    const parsed = JSON.parse(cleaned)

    // Validate required fields
    if (typeof parsed.find !== 'string' || typeof parsed.replace !== 'string' || typeof parsed.explanation !== 'string') {
      return {
        success: false,
        code: 'INVALID_LLM_RESPONSE',
        message: 'LLM response missing required fields (find, replace, explanation)'
      }
    }

    // Empty find/replace means the LLM couldn't make the edit
    if (!parsed.find && !parsed.replace) {
      return {
        success: false,
        code: 'LLM_CANNOT_EDIT',
        message: parsed.explanation || 'LLM could not make this edit'
      }
    }

    return {
      success: true,
      find: parsed.find,
      replace: parsed.replace,
      explanation: parsed.explanation,
    }

  } catch {
    // JSON parse failed — retry logic handled in server.js
    return {
      success: false,
      code: 'JSON_PARSE_FAILED',
      message: `Could not parse LLM response as JSON. Raw: ${cleaned.slice(0, 200)}`
    }
  }
}
```

---

## Update `agent/server.js` — Add LLM call

Replace the Phase 3 debug section in the `EDIT_REQUEST` handler:

```js
import { getEditInstruction } from './llm.js'

// Inside the EDIT_REQUEST handler, after sourceResult is confirmed success:

console.log('✅ Source resolved. Calling LLM...')

// First attempt
let llmResult = await getEditInstruction({
  sourceResult,
  elementHtml,
  elementClasses,
  prompt,
  config,
})

// One retry if JSON parse failed
if (!llmResult.success && llmResult.code === 'JSON_PARSE_FAILED') {
  console.log('LLM returned invalid JSON, retrying with stricter prompt...')
  llmResult = await getEditInstruction({
    sourceResult,
    elementHtml,
    elementClasses,
    prompt: prompt + ' — respond with ONLY the JSON object, nothing else',
    config,
  })
}

if (!llmResult.success) {
  ws.send(JSON.stringify({
    type: MSG.EDIT_ERROR,
    sessionId,
    code: llmResult.code,
    message: llmResult.message,
  }))
  return
}

console.log('✅ LLM response:', llmResult.explanation)
console.log('  find:', llmResult.find.slice(0, 80))
console.log('  replace:', llmResult.replace.slice(0, 80))

// Phase 4: send preview to extension — Phase 5 will add file writing after confirmation
ws.send(JSON.stringify({
  type: 'PATCHLY_PREVIEW',   // new message type
  sessionId,
  explanation: llmResult.explanation,
  find: llmResult.find,
  replace: llmResult.replace,
  filePath: sourceResult.relativePath,
  lineNumber: sourceResult.lineNumber,
  // Store in memory so Phase 5 can apply it on CONFIRM
  _pendingEdit: {
    absolutePath: sourceResult.absolutePath,
    find: llmResult.find,
    replace: llmResult.replace,
  }
}))

// Keep pending edit in memory keyed by sessionId
pendingEdits.set(sessionId, {
  absolutePath: sourceResult.absolutePath,
  find: llmResult.find,
  replace: llmResult.replace,
})
```

Add at top of `server.js`:
```js
const pendingEdits = new Map()  // sessionId → { absolutePath, find, replace }
```

Add `PATCHLY_PREVIEW` to `shared/protocol.js`:
```js
export const MSG = {
  // ... existing entries ...
  PREVIEW: 'PATCHLY_PREVIEW',
  CONFIRM: 'PATCHLY_CONFIRM',
}
```

---

## Update `extension/overlay.js` — Show Preview Toast

Add a preview toast that appears when the agent sends back `PATCHLY_PREVIEW`:

```js
// Add to overlay.js

function showPreviewToast({ explanation, find, replace, filePath, lineNumber, sessionId }) {
  // Remove any existing toast
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
  `

  toast.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;color:#1a1a1a">
      🩹 Patchly will:
    </div>
    <div style="color:#444;margin-bottom:10px;line-height:1.4">
      ${explanation}
    </div>
    <div style="font-size:11px;color:#888;margin-bottom:12px">
      ${filePath} · line ${lineNumber}
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
    // Phase 5: send CONFIRM to agent
    if (window.__patchlySendToAgent) {
      window.__patchlySendToAgent({ type: 'PATCHLY_CONFIRM', sessionId })
    }
  }

  document.getElementById('patchly-reject').onclick = () => {
    toast.remove()
    // Phase 5: send REJECT to agent
    if (window.__patchlySendToAgent) {
      window.__patchlySendToAgent({ type: 'PATCHLY_REJECT', sessionId })
    }
  }

  // Auto-dismiss after 30 seconds
  setTimeout(() => toast.remove(), 30000)
}

// Expose for content.js to call when it receives PATCHLY_PREVIEW from agent
window.__patchlyShowPreview = showPreviewToast
```

Update `content.js` WebSocket message handler to call it:
```js
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)

  if (msg.type === MSG_PONG || msg.type === MSG_STATUS) {
    isConnected = true
    chrome.runtime.sendMessage({ type: 'AGENT_STATUS', connected: true })
  }

  if (msg.type === 'PATCHLY_PREVIEW') {
    if (window.__patchlyShowPreview) {
      window.__patchlyShowPreview(msg)
    }
  }
}

// Expose send function for overlay.js to use
window.__patchlySendToAgent = (data) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}
```

---

## Phase 4 Tasks Checklist

- [ ] Create `agent/llm.js` with full code above
- [ ] Update `agent/server.js` with LLM call and `pendingEdits` map
- [ ] Add `PREVIEW` and `CONFIRM` to `shared/protocol.js`
- [ ] Add preview toast to `overlay.js`
- [ ] Update `content.js` to handle `PATCHLY_PREVIEW` message
- [ ] Fill in Azure credentials in `.patchlyrc.json`:
  ```json
  {
    "azureEndpoint": "https://YOUR-RESOURCE.openai.azure.com",
    "azureApiKey": "YOUR-KEY",
    "model": "gpt-4o"
  }
  ```
- [ ] Full test: activate Patchly → draw box → type "make this button red" → press Enter
- [ ] Verify agent terminal shows LLM call succeeded
- [ ] Verify preview toast appears in bottom-right of browser
- [ ] Verify explanation is sensible (e.g. "Changed button background to red")
- [ ] Click Cancel → toast dismisses, nothing changes in code (Phase 5 does the write)
- [ ] Test error case: disconnect from internet → verify error toast appears

---

## Phase 4 Pass Criteria

- [ ] Full round trip works: selection → prompt → agent → Azure → preview toast
- [ ] Preview toast shows sensible explanation
- [ ] Preview toast shows correct filename and line number
- [ ] Cancel dismisses the toast with no side effects
- [ ] Agent handles Azure API errors gracefully (wrong key, no connection)
- [ ] Agent handles malformed LLM JSON with one retry
- [ ] No crashes in agent on any of the above error paths

Proceed to Phase 5 only when all pass criteria are met.
