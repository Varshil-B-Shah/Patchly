// agent/llm.js
// Calls Azure OpenAI and returns a structured EditRequest.
// Sends a screenshot (vision), direct imports, global CSS, and Tailwind design
// tokens alongside the component source so the model can see what it's editing.

import { OPS } from '../shared/operations.js'
import { loadProjectContext } from './contextBuilder.js'

const VALID_OPS = new Set(Object.values(OPS))

// Single-element edit (the interactive path): one target + optional screenshot.
export async function getEditInstruction({ sourceResult, elementHtml, elementClasses, prompt, config, screenshot_base64, onProgress }) {
  // Context (imports, global CSS, tailwind tokens). Best-effort — never blocks.
  let context = { imports: [], globalCss: null, tailwindTokens: '' }
  try {
    context = loadProjectContext(sourceResult, config.projectRoot)
  } catch {}

  const systemPrompt = buildSystemPrompt(context.tailwindTokens)
  const userPrompt = buildUserPrompt({ sourceResult, elementHtml, elementClasses, prompt, context })

  const userContent = screenshot_base64
    ? [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot_base64}` } },
        { type: 'text', text: userPrompt },
      ]
    : userPrompt

  const res = await callLLM({ config, systemPrompt, userContent, onProgress })
  if (!res.ok) return res
  return parseEditRequest(res.rawContent)
}

// Multi-element edit within ONE file (the batch / fan-out path): all targets are
// sent with the file body included exactly once, and the model returns a single
// coherent operations[] covering every target. This both avoids the per-op drift
// of merging independent single-target responses AND sends the file once instead
// of N times. No screenshot (batch is text-context only).
export async function getBatchEditInstruction({ sourceResult, items, prompt, config, onProgress }) {
  let context = { imports: [], globalCss: null, tailwindTokens: '' }
  try {
    context = loadProjectContext(sourceResult, config.projectRoot)
  } catch {}

  const systemPrompt = buildSystemPrompt(context.tailwindTokens)
  const userPrompt = buildBatchUserPrompt({ sourceResult, items, prompt, context })

  const res = await callLLM({ config, systemPrompt, userContent: userPrompt, onProgress })
  if (!res.ok) return res
  return parseEditRequest(res.rawContent)
}

// Shared LLM transport: credentials, streaming fetch, idle timeout, finish_reason
// handling. Returns { ok:true, rawContent } or { ok:false, code, message }.
async function callLLM({ config, systemPrompt, userContent, onProgress }) {
  const { azureEndpoint, azureApiKey, model } = config
  const endpoint = azureEndpoint || process.env.PATCHLY_AZURE_ENDPOINT
  const apiKey = azureApiKey || process.env.PATCHLY_AZURE_KEY
  const modelName = model || 'gpt-4o'

  if (!endpoint || !apiKey) {
    return {
      ok: false, success: false,
      code: 'NO_CREDENTIALS',
      message: 'Azure endpoint and API key are required. Add them to .patchlyrc.json or set PATCHLY_AZURE_ENDPOINT and PATCHLY_AZURE_KEY env vars.',
    }
  }

  const { url, includeModelInBody } = buildRequestConfig(endpoint, modelName)

  console.log('[LLM] Calling:', url)
  console.log('[LLM] Model:', modelName, '| includeModelInBody:', includeModelInBody)

  // Idle-based abort: reset on every streamed chunk so a long (but progressing)
  // generation isn't killed, while a truly stalled request still times out.
  const IDLE_TIMEOUT_MS = 45000
  const controller = new AbortController()
  let timeoutId
  const armTimeout = () => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      console.log('[LLM] Idle timeout fired — aborting fetch')
      controller.abort()
    }, IDLE_TIMEOUT_MS)
  }
  armTimeout()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_completion_tokens: 4000,
        temperature: 0.1,
        stream: true,
        ...(includeModelInBody ? { model: modelName } : {}),
      }),
      signal: controller.signal,
    })

    console.log('[LLM] Response status:', response.status)

    if (!response.ok) {
      clearTimeout(timeoutId)
      const errorText = await response.text()
      console.log('[LLM] Error body:', errorText.slice(0, 300))
      return {
        ok: false, success: false,
        code: 'LLM_API_ERROR',
        message: `Azure API error (status ${response.status}). Check your endpoint URL and API key in settings.`,
      }
    }

    const { content: rawContent, finishReason } = await consumeStream(response.body, armTimeout, onProgress)
    clearTimeout(timeoutId)
    console.log('[LLM] finish_reason:', finishReason)

    if (!rawContent) {
      return { ok: false, success: false, code: 'EMPTY_RESPONSE', message: 'LLM returned empty response' }
    }

    // The model hit the token ceiling mid-response — the JSON is truncated.
    if (finishReason === 'length') {
      return {
        ok: false, success: false,
        code: 'LLM_BAD_OUTPUT',
        message: 'The edit was too large for the AI to return in one response. Try a simpler or more specific change.',
      }
    }

    return { ok: true, rawContent }

  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    return {
      ok: false, success: false,
      code: isTimeout ? 'LLM_TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? `Azure API request timed out (no data for ${IDLE_TIMEOUT_MS / 1000}s). Check your endpoint URL: ${url}`
        : `Network error calling Azure: ${err.message}`,
    }
  }
}

// Read an OpenAI/Azure SSE stream to completion, accumulating the assistant
// content. Calls armTimeout() on each chunk (idle reset) and onProgress({ stage,
// text }) with the explanation as soon as it can be extracted from the partial
// JSON. Returns { content, finishReason }.
async function consumeStream(body, armTimeout, onProgress) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let finishReason = null
  let explanationSent = false

  const maybeEmitExplanation = () => {
    if (explanationSent || !onProgress) return
    // explanation is the first JSON field; capture it once its closing quote lands.
    const m = content.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (m) {
      explanationSent = true
      let text = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\')
      onProgress({ stage: 'generating', text })
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    armTimeout()
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by newlines; each data line is a JSON delta.
    const lines = buffer.split('\n')
    buffer = lines.pop()  // keep the trailing partial line

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const choice = json.choices?.[0]
        const delta = choice?.delta?.content
        if (delta) content += delta
        if (choice?.finish_reason) finishReason = choice.finish_reason
      } catch {
        // Ignore keep-alive / non-JSON frames.
      }
    }

    maybeEmitExplanation()
  }

  return { content, finishReason }
}

function buildRequestConfig(endpoint, modelName) {
  const base = endpoint.replace(/\/+$/, '')

  if (base.includes('/v1') || base.includes('cognitiveservices.azure.com')) {
    return { url: `${base}/chat/completions`, includeModelInBody: true }
  } else {
    return {
      url: `${base}/openai/deployments/${modelName}/chat/completions?api-version=2024-02-15-preview`,
      includeModelInBody: false,
    }
  }
}

function buildSystemPrompt(tailwindTokens = '') {
  const visualSection = `
A screenshot of the selected element may be attached as an image. If present, use it to understand the current visual state — colours, layout, spacing — before deciding which classes to add or remove.`

  const designSection = tailwindTokens
    ? `\nProject design tokens (use ONLY these custom tokens — do not invent classes that aren't in this list):\n${tailwindTokens}`
    : ''

  return `You are a React JSX code editor. You make surgical edits by emitting structured operations.${visualSection}${designSection}

Respond with ONLY a valid JSON object — no markdown, no backticks, no explanation outside the JSON.

The response must match this schema exactly:
{
  "explanation": "one short sentence describing what changed",
  "confidence": 0.95,
  "operations": [
    {
      "op": "<operation name>",
      "target": {
        "file": "<relative file path, e.g. src/components/Hero.jsx>",
        "line": <1-based line number from data-patchly-src>,
        "column": <0-based column from data-patchly-src>,
        "tagName": "<HTML/component tag, e.g. h1>",
        "textSnippet": "<first ~40 chars of visible text content, if any>"
      },
      ... operation-specific fields ...
    }
  ]
}

Available operations and their fields:

setClassName — Add/remove Tailwind class tokens. ALWAYS prefer this for Tailwind changes.
  "add": ["class-to-add"],   "remove": ["class-to-remove"]
  — add only the tokens being added, remove only the tokens being removed. Never rewrite the full class string.

setAttribute — Set or remove any JSX attribute (except className and style).
  "name": "href",  "value": "/new-path"   (string value)
  "name": "disabled",  "value": null       (null removes the attribute)

setText — Replace the visible text content of an element.
  "text": "New text content"
  Only use when the element contains ONLY plain text (no child elements or expressions).

setInlineStyle — Merge CSS properties into style={{ }}.
  "styles": { "color": "red", "marginTop": "8px" }
  Only use when the existing code already uses inline styles, or the instruction explicitly requests inline style.

wrapElement — Wrap the element in a new tag.
  "wrapperTag": "div",  "wrapperClassName": "flex items-center"  (wrapperClassName optional)

insertChild — Insert JSX as a child element.
  "position": "first" | "last" | <number>,  "jsx": "<span>New child</span>"

replaceElement — Replace the entire element with new JSX. Use ONLY as a last resort.
  "jsx": "<button className=\"btn\">Click</button>"

removeElement — Remove the element entirely. No extra fields.

Decision rules:
- Use setClassName for Tailwind class changes — do NOT use replaceElement just to change classes.
- Use setAttribute for src, href, alt, aria-*, data-* and similar attribute changes.
- Use setText only for plain text. If children are complex, use replaceElement.
- Use setInlineStyle only when the instruction says "inline style" or the element already has style={{}}.
- Multiple operations are allowed for compound edits (e.g. setClassName + setText together).
- If you cannot make the edit, return "operations": [] and explain in "explanation".

CRITICAL — operations may only target elements that LITERALLY appear in the file source below:
- Every operation's target must be a lowercase HTML element you can actually see in the source (e.g. <th>, <button>, <li>, <p>).
- NEVER emit an operation for content rendered by a child component. Child components are CAPITALIZED JSX tags (e.g. <UserRow/>, <StatsCard/>, <Badge/>) — their internal elements live in OTHER files, so you do not have their line numbers. Do not guess line numbers for them.

Cross-file redirect:
- If the element the instruction refers to is rendered by an imported child component (a capitalized tag like <UserRow/> or <StatsCard/>) and is therefore NOT in this file, do NOT force an edit, do NOT guess a line, and do NOT just refuse. Instead return "operations": [] AND a "redirect" array naming the most likely child component file(s) from the imports:
  "redirect": [ { "file": "src/features/users/components/UserRow.jsx", "reason": "the status badge is rendered inside UserRow, not the table header" } ]
- If the instruction would touch BOTH an element in this file AND something inside a child component, prefer the redirect to the child component (where the visible thing the user described actually lives) rather than editing only the in-file part.
- Use the import paths you were given to pick the file. List multiple only if genuinely unsure.

Examples:

User: "make the heading bold and blue"
{
  "explanation": "Added font-bold and text-blue-600 to h1",
  "confidence": 0.97,
  "operations": [{
    "op": "setClassName",
    "target": { "file": "src/components/Hero.jsx", "line": 6, "column": 6, "tagName": "h1", "textSnippet": "Hello Patchly" },
    "add": ["font-bold", "text-blue-600"],
    "remove": []
  }]
}

User: "change the link destination to /about"
{
  "explanation": "Updated href to /about",
  "confidence": 0.99,
  "operations": [{
    "op": "setAttribute",
    "target": { "file": "src/components/Nav.jsx", "line": 12, "column": 8, "tagName": "a", "textSnippet": "About" },
    "name": "href",
    "value": "/about"
  }]
}`
}

function buildUserPrompt({ sourceResult, elementHtml, elementClasses, prompt, context = {} }) {
  const textSnippet = (elementHtml || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)

  const lines = [
    `File: ${sourceResult.relativePath}`,
    `Line: ${sourceResult.lineNumber}  Column: ${sourceResult.colNumber ?? 0}`,
    '',
    `Selected element classes: ${elementClasses || '(none)'}`,
    `Text snippet: ${textSnippet || '(none)'}`,
    '',
    'Selected element HTML:',
    elementHtml.slice(0, 400),
    '',
    'Full file contents:',
    '```jsx',
    sourceResult.fullContent,
    '```',
  ]

  if (context.imports?.length > 0) {
    lines.push('', '### Direct imports')
    for (const imp of context.imports) {
      lines.push(`/* ${imp.path} */`, '```jsx', imp.content, '```')
    }
  }

  if (context.globalCss) {
    lines.push('', '### Global CSS (excerpt)', '```css', context.globalCss, '```')
  }

  lines.push('', `User instruction: ${prompt}`)
  return lines.join('\n')
}

// Build a prompt that edits MULTIPLE elements in one file. The file body appears
// exactly once; each target is listed with its line/column so the model can emit
// one operation per change with correct positions.
function buildBatchUserPrompt({ sourceResult, items, prompt, context = {} }) {
  const lines = [
    `File: ${sourceResult.relativePath}`,
    '',
    `You are editing ${items.length} elements in THIS ONE file. Apply the instruction to EACH target below.`,
    'Return ONE operations[] array covering all targets — each operation must carry the correct target.line and target.column for its element. Do not edit elements that are not listed.',
    '',
    'Targets:',
  ]

  items.forEach((it, i) => {
    const textSnippet = (it.elementHtml || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40)
    lines.push(
      `${i + 1}. line ${it.lineNumber} column ${it.colNumber ?? 0} — classes: ${it.elementClasses || '(none)'} — text: ${textSnippet || '(none)'}`,
      `   html: ${(it.elementHtml || '').slice(0, 240)}`,
    )
  })

  lines.push('', 'Full file contents:', '```jsx', sourceResult.fullContent, '```')

  if (context.imports?.length > 0) {
    lines.push('', '### Direct imports')
    for (const imp of context.imports) {
      lines.push(`/* ${imp.path} */`, '```jsx', imp.content, '```')
    }
  }

  if (context.globalCss) {
    lines.push('', '### Global CSS (excerpt)', '```css', context.globalCss, '```')
  }

  lines.push('', `User instruction: ${prompt}`)
  return lines.join('\n')
}

function parseEditRequest(rawContent) {
  let cleaned = rawContent.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
  }

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.log(`[LLM] Could not parse response as JSON (length ${cleaned.length}). Head:`, cleaned.slice(0, 200))
    console.log('[LLM] Tail:', cleaned.slice(-120))
    return { ok: false, success: false, code: 'JSON_PARSE_FAILED', message: "Patchly couldn't understand the AI's response. Please try again." }
  }

  // Validate top-level shape.
  if (
    typeof parsed.explanation !== 'string' ||
    !Array.isArray(parsed.operations) ||
    typeof parsed.confidence !== 'number'
  ) {
    console.log('[LLM] Bad schema:', JSON.stringify(parsed).slice(0, 200))
    return { ok: false, success: false, code: 'LLM_BAD_OUTPUT', message: 'LLM response does not match EditRequest schema.' }
  }

  // Cross-file redirect: the target lives in an imported child component.
  if (Array.isArray(parsed.redirect) && parsed.redirect.length > 0) {
    const suggestions = parsed.redirect
      .filter((r) => r && typeof r.file === 'string')
      .map((r) => ({ file: r.file, reason: typeof r.reason === 'string' ? r.reason : '' }))
    if (suggestions.length > 0) {
      return { ok: false, success: false, code: 'REDIRECT_SUGGESTED', suggestions, explanation: parsed.explanation }
    }
  }

  // Cannot edit.
  if (parsed.operations.length === 0) {
    return { ok: false, success: false, code: 'LLM_CANNOT_EDIT', message: parsed.explanation || 'LLM could not make this edit.' }
  }

  // Validate each operation.
  for (const op of parsed.operations) {
    if (!VALID_OPS.has(op.op)) {
      console.log('[LLM] Unknown op:', op.op)
      return { ok: false, success: false, code: 'LLM_BAD_OUTPUT', message: `LLM emitted unknown operation: ${op.op}` }
    }
    const t = op.target
    if (!t || typeof t.file !== 'string' || typeof t.line !== 'number' || typeof t.column !== 'number' || typeof t.tagName !== 'string') {
      console.log('[LLM] Bad target:', JSON.stringify(t))
      return { ok: false, success: false, code: 'LLM_BAD_OUTPUT', message: 'LLM operation is missing required target fields (file, line, column, tagName).' }
    }
  }

  return {
    ok: true, success: true,
    operations: parsed.operations,
    explanation: parsed.explanation,
    confidence: parsed.confidence,
  }
}
