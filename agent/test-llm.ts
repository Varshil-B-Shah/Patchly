// agent/test-llm.ts
// Run: npx tsx agent/test-llm.ts
// Tests the Azure connection in isolation — no agent, no extension needed

import fs from 'fs'
import path from 'path'

const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '.patchlyrc.json'), 'utf8'))

const endpoint: string = config.azureEndpoint
const apiKey: string = config.azureApiKey
const modelName: string = config.model

const base = endpoint.replace(/\/+$/, '')
const url = base.includes('/v1') || base.includes('cognitiveservices.azure.com')
  ? `${base}/chat/completions`
  : `${base}/openai/deployments/${modelName}/chat/completions?api-version=2024-02-15-preview`

console.log('Endpoint:', endpoint)
console.log('URL:', url)
console.log('Model:', modelName)
console.log('Calling LLM...')

const controller = new AbortController()
const timeoutId = setTimeout(() => {
  console.log('TIMED OUT after 30s')
  controller.abort()
}, 30000)

const start = Date.now()

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: 'Say exactly: hello' }],
      max_completion_tokens: 20,
      temperature: 0,
    }),
    signal: controller.signal,
  })

  clearTimeout(timeoutId)
  console.log(`Response in ${Date.now() - start}ms — status: ${response.status}`)

  const text = await response.text()
  console.log('Raw response:', text.slice(0, 500))

  if (response.ok) {
    const data = JSON.parse(text)
    console.log('LLM says:', data.choices?.[0]?.message?.content)
  }
} catch (err) {
  clearTimeout(timeoutId)
  console.log('Error:', err instanceof Error ? `${err.name} ${err.message}` : String(err))
}
