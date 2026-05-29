# Phase 0 — Source Mapping Spike
> Throwaway experiment. Prove the core technical assumption before building anything else.
> Estimated time: 2–3 days
> Output: confidence that DOM element → source file mapping works reliably on real Vite+React projects

---

## What This Phase Is

Do NOT build any extension UI. Do NOT build any agent server. This is a throwaway script that proves one thing:

**Given a DOM element on a running Vite+React+Tailwind localhost app, can we reliably get back the source file path and line number?**

If yes → proceed to Phase 1 with confidence.
If no → figure out why before writing a single line of real product code.

---

## What To Build

A single standalone Node.js script + a minimal Vite plugin. Nothing more.

### Folder structure for this spike (throw away after)
```
patchly-spike/
├── test-app/              # minimal Vite+React+Tailwind app to test against
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── Hero.jsx
│   │       └── Button.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── spike.js               # the test script
└── patchly-vite-plugin.js # the plugin to test
```

---

## Step 1 — Create the test Vite app

Create a minimal React+Vite+Tailwind app with at least 3 components in different files. It must be realistic — nested components, not just one App.jsx.

`test-app/src/components/Hero.jsx` should look something like:
```jsx
export function Hero() {
  return (
    <div className="flex flex-col items-center py-20 bg-gray-50">
      <h1 className="text-4xl font-bold text-gray-900">Hello Patchly</h1>
      <p className="mt-4 text-lg text-gray-600">Select any element and fix it</p>
      <Button label="Get Started" />
    </div>
  )
}
```

`test-app/src/components/Button.jsx`:
```jsx
export function Button({ label }) {
  return (
    <button className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
      {label}
    </button>
  )
}
```

---

## Step 2 — Write the Vite plugin

Create `patchly-vite-plugin.js`. This plugin runs during dev-mode build and adds a `data-patchly-src` attribute to every JSX element containing the file path, line number, and column.

```js
// patchly-vite-plugin.js
// This is the EXACT plugin to write. Do not deviate from this structure.

export function patchlyPlugin() {
  return {
    name: 'patchly-source-injector',
    enforce: 'pre',
    transform(code, id) {
      // Only run in dev mode
      // Only run on JSX/TSX files
      // Skip node_modules
      if (!id.includes('src/')) return null
      if (!id.match(/\.(jsx|tsx)$/)) return null
      if (id.includes('node_modules')) return null

      // Use @babel/parser to parse the JSX
      // Walk every JSXOpeningElement
      // Add data-patchly-src="filepath:line:col" to each one
      // Return the modified code

      // IMPORTANT: preserve source maps
      // Use @babel/generator to output modified AST back to code
    }
  }
}
```

Dependencies needed for this plugin:
```json
"@babel/parser": "^7.24.0",
"@babel/traverse": "^7.24.0",
"@babel/generator": "^7.24.0",
"@babel/types": "^7.24.0"
```

Install these in `test-app/`:
```bash
npm install -D @babel/parser @babel/traverse @babel/generator @babel/types
```

Wire it into `test-app/vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { patchlyPlugin } from '../patchly-vite-plugin.js'

export default defineConfig({
  plugins: [patchlyPlugin(), react()],
})
```

**Note:** `patchlyPlugin()` must come BEFORE `react()` in the plugins array. If it comes after, React's transform runs first and the JSX is already compiled — too late to inject attributes.

---

## Step 3 — Verify the injection in browser

Run `npm run dev` in `test-app/`. Open `http://localhost:5173`. Open browser DevTools. Inspect any element.

**You must see this:**
```html
<div data-patchly-src="src/components/Hero.jsx:5:4" class="flex flex-col ...">
```

If you do not see `data-patchly-src` on elements — the plugin is not running correctly. Debug the plugin before moving on. Do not proceed to Step 4 until every JSX element has this attribute.

---

## Step 4 — Write the spike script

Create `spike.js`. This simulates what the real agent will do — given a `data-patchly-src` value, resolve it to an absolute path and read the relevant lines.

```js
// spike.js
// Run with: node spike.js

import path from 'path'
import fs from 'fs'

// Simulate what the extension would send to the agent
const simulatedPayload = {
  patchlySrc: 'src/components/Hero.jsx:5:4',  // from data-patchly-src
  projectRoot: path.resolve('./test-app'),      // from .patchlyrc.json later
}

function resolveSource(patchlySrc, projectRoot) {
  // Parse the src string
  const [filePath, line, col] = patchlySrc.split(':')
  const lineNumber = parseInt(line)
  const colNumber = parseInt(col)

  // Resolve to absolute path
  const absolutePath = path.resolve(projectRoot, filePath)

  // Check file exists
  if (!fs.existsSync(absolutePath)) {
    return { success: false, error: `File not found: ${absolutePath}` }
  }

  // Read the file
  const content = fs.readFileSync(absolutePath, 'utf8')
  const lines = content.split('\n')

  // Extract context: target line + 3 lines above + 3 lines below
  const start = Math.max(0, lineNumber - 4)
  const end = Math.min(lines.length - 1, lineNumber + 2)
  const context = lines.slice(start, end + 1).join('\n')

  return {
    success: true,
    absolutePath,
    lineNumber,
    colNumber,
    targetLine: lines[lineNumber - 1],
    context,
    fullContent: content,
  }
}

// Run the test
const result = resolveSource(simulatedPayload.patchlySrc, simulatedPayload.projectRoot)

if (result.success) {
  console.log('✅ Source mapping works!')
  console.log('File:', result.absolutePath)
  console.log('Line:', result.lineNumber)
  console.log('Target line:', result.targetLine)
  console.log('Context:\n', result.context)
} else {
  console.log('❌ Failed:', result.error)
}
```

Run it:
```bash
node spike.js
```

**Expected output:**
```
✅ Source mapping works!
File: /Users/you/patchly-spike/test-app/src/components/Hero.jsx
Line: 5
Target line:     <div className="flex flex-col items-center py-20 bg-gray-50">
Context:
  export function Hero() {
    return (
      <div className="flex flex-col items-center py-20 bg-gray-50">
        <h1 className="text-4xl font-bold text-gray-900">Hello Patchly</h1>
```

---

## Step 5 — Stress test edge cases

Test these specific scenarios. All must work before the spike is considered successful:

**Case 1: Deeply nested component**
A component rendered inside another component inside another. The `data-patchly-src` must point to the file where the JSX is written, not where the parent is.

**Case 2: Component with conditional rendering**
```jsx
{isVisible && <div className="hidden-div">...</div>}
```
The injected attribute must still appear on the div.

**Case 3: Mapped list**
```jsx
{items.map(item => <div key={item.id} className="item">{item.name}</div>)}
```
Each div must have a unique `data-patchly-src` pointing to the correct line.

**Case 4: Component imported from a deeply nested path**
`src/features/dashboard/components/widgets/StatsCard.jsx` — the full relative path must appear in `data-patchly-src`, not just the filename.

For each case: inspect the element in DevTools, copy the `data-patchly-src` value, run it through `spike.js`, confirm you get the right file and line back.

---

## Pass Criteria

The spike passes when ALL of the following are true:

- [ ] Every JSX element in the test app has `data-patchly-src` in dev mode
- [ ] The attribute does NOT appear in production build (`npm run build`)
- [ ] `spike.js` correctly resolves all 4 edge case scenarios
- [ ] The target line content matches what you see rendered in the browser

---

## Fail Criteria — What To Do If It Breaks

**Problem: `data-patchly-src` not appearing on elements**
Cause: Plugin order wrong, or Babel transform not running.
Fix: Ensure `patchlyPlugin()` is before `react()` in vite.config.js. Add a `console.log` inside the plugin's `transform()` to confirm it's being called.

**Problem: File path in attribute is wrong/relative**
Cause: Vite passes different `id` formats depending on OS and config.
Fix: Normalize the path relative to `projectRoot` explicitly inside the plugin.

**Problem: Line numbers are off by 1–2**
Cause: Babel's line counting vs the actual file.
Fix: This is acceptable for v1 — being on the right line ±2 is enough for the LLM to find the correct element. Note it and move on.

**Problem: Attribute appears on every element including HTML tags inside JSX**
This is expected and correct. The agent will receive the most specific element the user clicked.

---

## After The Spike

Throw away `patchly-spike/`. You have proven the concept. Now you know:
- Exactly how the Vite plugin needs to work
- What the `data-patchly-src` format looks like
- How the agent resolves it to a file and line

Take the working `patchly-vite-plugin.js` code and save it — it becomes the real plugin in Phase 3.

Proceed to Phase 1.
