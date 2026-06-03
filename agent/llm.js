// agent/llm.js
// Calls Azure OpenAI and returns a structured edit instruction

export async function getEditInstruction({ sourceResult, elementHtml, elementClasses, prompt, config }) {
  const { azureEndpoint, azureApiKey, model } = config

  const endpoint = azureEndpoint || process.env.PATCHLY_AZURE_ENDPOINT
  const apiKey = azureApiKey || process.env.PATCHLY_AZURE_KEY
  const modelName = model || 'gpt-4o'

  if (!endpoint || !apiKey) {
    return {
      success: false,
      code: 'NO_CREDENTIALS',
      message: 'Azure endpoint and API key are required. Add them to .patchlyrc.json or set PATCHLY_AZURE_ENDPOINT and PATCHLY_AZURE_KEY env vars.',
    }
  }

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt({ sourceResult, elementHtml, elementClasses, prompt })

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
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 600,
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
        success: false,
        code: 'LLM_API_ERROR',
        message: `Azure API error ${response.status}: ${errorText.slice(0, 200)}`,
      }
    }

    const data = await response.json()
    const rawContent = data.choices?.[0]?.message?.content

    if (!rawContent) {
      return {
        success: false,
        code: 'EMPTY_RESPONSE',
        message: 'LLM returned empty response',
      }
    }

    return parseEditInstruction(rawContent)

  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err.name === 'AbortError'
    return {
      success: false,
      code: isTimeout ? 'LLM_TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? `Azure API request timed out after 30 seconds. Check your endpoint URL: ${url}`
        : `Network error calling Azure: ${err.message}`,
    }
  }
}

function buildRequestConfig(endpoint, modelName) {
  const base = endpoint.replace(/\/+$/, '')  // strip trailing slash(es)

  if (base.includes('/v1') || base.includes('cognitiveservices.azure.com')) {
    // New format: OpenAI-compatible endpoint — model goes in request body
    return {
      url: `${base}/chat/completions`,
      includeModelInBody: true,
    }
  } else {
    // Old format: deployment name in URL path
    return {
      url: `${base}/openai/deployments/${modelName}/chat/completions?api-version=2024-02-15-preview`,
      includeModelInBody: false,
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
  let cleaned = rawContent.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
  }

  try {
    const parsed = JSON.parse(cleaned)

    if (typeof parsed.find !== 'string' || typeof parsed.replace !== 'string' || typeof parsed.explanation !== 'string') {
      return {
        success: false,
        code: 'INVALID_LLM_RESPONSE',
        message: 'LLM response missing required fields (find, replace, explanation)',
      }
    }

    if (!parsed.find && !parsed.replace) {
      return {
        success: false,
        code: 'LLM_CANNOT_EDIT',
        message: parsed.explanation || 'LLM could not make this edit',
      }
    }

    return {
      success: true,
      find: parsed.find,
      replace: parsed.replace,
      explanation: parsed.explanation,
    }

  } catch {
    return {
      success: false,
      code: 'JSON_PARSE_FAILED',
      message: `Could not parse LLM response as JSON. Raw: ${cleaned.slice(0, 200)}`,
    }
  }
}
