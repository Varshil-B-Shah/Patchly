// agent/llm.js
// Calls Azure OpenAI and returns a structured EditRequest.
// Sends a screenshot (vision), direct imports, global CSS, and Tailwind design
// tokens alongside the component source so the model can see what it's editing.

import { OPS } from '../shared/operations.js'
import { loadProjectContext } from './contextBuilder.js'

const VALID_OPS = new Set(Object.values(OPS))

export async function getEditInstruction({ sourceResult, elementHtml, elementClasses, prompt, config, screenshot_base64 }) {
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

  // Load file context (imports, global CSS, tailwind tokens). Failures are silent.
  let context = { imports: [], globalCss: null, tailwindTokens: '' }
  try {
    context = loadProjectContext(sourceResult, config.projectRoot)
  } catch {
    // Context enrichment is best-effort — never block an edit.
  }

  const systemPrompt = buildSystemPrompt(context.tailwindTokens)
  const userPrompt = buildUserPrompt({ sourceResult, elementHtml, elementClasses, prompt, context })

  const { url, includeModelInBody } = buildRequestConfig(endpoint, modelName)

  console.log('[LLM] Calling:', url)
  console.log('[LLM] Model:', modelName, '| includeModelInBody:', includeModelInBody)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    console.log('[LLM] Timeout fired — aborting fetch')
    controller.abort()
  }, 30000)

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
          {
            role: 'user',
            content: screenshot_base64
              ? [
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot_base64}` } },
                  { type: 'text', text: userPrompt },
                ]
              : userPrompt,
          },
        ],
        max_completion_tokens: 800,
        temperature: 0.1,
        ...(includeModelInBody ? { model: modelName } : {}),
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    console.log('[LLM] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log('[LLM] Error body:', errorText.slice(0, 300))
      return {
        ok: false, success: false,
        code: 'LLM_API_ERROR',
        message: `Azure API error (status ${response.status}). Check your endpoint URL and API key in settings.`,
      }
    }

    const data = await response.json()
    const rawContent = data.choices?.[0]?.message?.content

    if (!rawContent) {
      return { ok: false, success: false, code: 'EMPTY_RESPONSE', message: 'LLM returned empty response' }
    }

    return parseEditRequest(rawContent)

  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    return {
      ok: false, success: false,
      code: isTimeout ? 'LLM_TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? `Azure API request timed out after 30 seconds. Check your endpoint URL: ${url}`
        : `Network error calling Azure: ${err.message}`,
    }
  }
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

function parseEditRequest(rawContent) {
  let cleaned = rawContent.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
  }

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.log('[LLM] Could not parse response as JSON. Raw:', cleaned.slice(0, 200))
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
