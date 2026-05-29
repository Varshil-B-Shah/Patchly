# Phase 3 — Source Mapping (Real Implementation)
> Prerequisite: Phase 2 pass criteria all met. Phase 0 spike proved the approach works.
> Goal: Agent reliably resolves any patchlySrc string to an absolute file path + line number + file contents.
> Estimated time: 3–4 days

---

## What This Phase Builds

Take the throwaway spike from Phase 0 and turn it into the real production-grade source mapper inside the agent. By end of Phase 3:

- The Vite plugin is properly packaged inside Patchly (not a separate spike file)
- `npx patchly init` auto-creates `.patchlyrc.json` and prints vite.config.js instructions
- `agent/sourceMapper.js` resolves any incoming `patchlySrc` to file path + line + full file content
- Agent handles the `EDIT_REQUEST` message up to source resolution (no LLM yet — that's Phase 4)

---

## New Files To Create

```
patchly/
├── agent/
│   └── sourceMapper.js     ← NEW
├── vite-plugin/
│   └── index.js            ← NEW (the real plugin, ported from spike)
└── bin/
    └── init.js             ← NEW (npx patchly init command)
```

---

## `vite-plugin/index.js`

This is the plugin users add to their `vite.config.js`. Port it directly from your Phase 0 spike — you already proved it works.

```js
// vite-plugin/index.js
// Patchly Vite plugin — adds data-patchly-src to every JSX element in dev mode
// Users add this to their vite.config.js:
//   import { patchlyPlugin } from 'patchly/vite'
//   plugins: [patchlyPlugin(), react()]

import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'
import path from 'path'

export function patchlyPlugin() {
  let projectRoot = process.cwd()

  return {
    name: 'patchly-source-injector',
    enforce: 'pre',  // MUST run before react plugin

    configResolved(config) {
      projectRoot = config.root
    },

    transform(code, id) {
      // Dev mode only
      if (process.env.NODE_ENV === 'production') return null

      // JSX/TSX files only
      if (!id.match(/\.(jsx|tsx)$/)) return null

      // Skip node_modules
      if (id.includes('node_modules')) return null

      // Skip Patchly's own files
      if (id.includes('patchly')) return null

      try {
        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
        })

        // Relative path from project root
        const relativePath = path.relative(projectRoot, id).replace(/\\/g, '/')

        let modified = false

        traverse.default(ast, {
          JSXOpeningElement(nodePath) {
            const { loc } = nodePath.node
            if (!loc) return

            // Don't add to fragments
            if (t.isJSXIdentifier(nodePath.node.name) &&
                nodePath.node.name.name === '') return

            const srcValue = `${relativePath}:${loc.start.line}:${loc.start.column}`

            // Check if attribute already exists (avoid duplicates on re-transform)
            const alreadyHas = nodePath.node.attributes.some(
              attr => t.isJSXAttribute(attr) &&
                      t.isJSXIdentifier(attr.name) &&
                      attr.name.name === 'data-patchly-src'
            )

            if (alreadyHas) return

            // Add data-patchly-src attribute
            const attr = t.jsxAttribute(
              t.jsxIdentifier('data-patchly-src'),
              t.stringLiteral(srcValue)
            )

            nodePath.node.attributes.push(attr)
            modified = true
          }
        })

        if (!modified) return null

        const output = generate.default(ast, {
          retainLines: true,   // keeps line numbers intact for debugging
          sourceMaps: true,
          sourceFileName: id,
        }, code)

        return {
          code: output.code,
          map: output.map,
        }

      } catch (err) {
        // Never crash the dev server — just skip this file silently
        console.warn(`[Patchly] Could not instrument ${relativePath}:`, err.message)
        return null
      }
    }
  }
}
```

Add to `package.json` exports:
```json
{
  "exports": {
    ".": "./agent/index.js",
    "./vite": "./vite-plugin/index.js"
  }
}
```

Add Babel dependencies to `package.json`:
```json
"dependencies": {
  "ws": "^8.16.0",
  "@babel/parser": "^7.24.0",
  "@babel/traverse": "^7.24.0",
  "@babel/generator": "^7.24.0",
  "@babel/types": "^7.24.0"
}
```

---

## `agent/sourceMapper.js`

```js
// agent/sourceMapper.js
// Resolves a patchlySrc string to absolute path + file contents

import fs from 'fs'
import path from 'path'

const MAX_FILE_SIZE_BYTES = 500 * 1024  // 500KB safety limit

export function resolveSource(patchlySrc, projectRoot) {
  if (!patchlySrc) {
    return {
      success: false,
      code: 'NO_SOURCE_ATTR',
      message: 'Element has no data-patchly-src attribute. Make sure patchlyPlugin() is in your vite.config.js and the dev server was restarted.'
    }
  }

  // Parse "src/components/Hero.jsx:5:4"
  const parts = patchlySrc.split(':')
  if (parts.length < 2) {
    return {
      success: false,
      code: 'INVALID_SRC_FORMAT',
      message: `Invalid patchlySrc format: ${patchlySrc}`
    }
  }

  const filePath = parts[0]
  const lineNumber = parseInt(parts[1], 10)
  const colNumber = parseInt(parts[2] || '0', 10)

  // Resolve absolute path
  const absolutePath = path.resolve(projectRoot, filePath)

  // Security: ensure the file is inside projectRoot
  if (!absolutePath.startsWith(path.resolve(projectRoot))) {
    return {
      success: false,
      code: 'PATH_TRAVERSAL',
      message: 'Resolved path is outside project root. Refusing to read.'
    }
  }

  // Check file exists
  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      code: 'FILE_NOT_FOUND',
      message: `File not found: ${absolutePath}`
    }
  }

  // Safety: don't read huge files
  const stats = fs.statSync(absolutePath)
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      code: 'FILE_TOO_LARGE',
      message: `File too large (${Math.round(stats.size / 1024)}KB). Max is 500KB.`
    }
  }

  // Read the file
  const content = fs.readFileSync(absolutePath, 'utf8')
  const lines = content.split('\n')

  // Validate line number
  if (lineNumber < 1 || lineNumber > lines.length) {
    return {
      success: false,
      code: 'LINE_OUT_OF_RANGE',
      message: `Line ${lineNumber} is out of range (file has ${lines.length} lines)`
    }
  }

  // Extract target line and surrounding context (for LLM in Phase 4)
  const contextStart = Math.max(0, lineNumber - 5)
  const contextEnd = Math.min(lines.length - 1, lineNumber + 4)
  const contextLines = lines.slice(contextStart, contextEnd + 1).join('\n')

  return {
    success: true,
    absolutePath,
    relativePath: filePath,
    lineNumber,
    colNumber,
    targetLine: lines[lineNumber - 1],
    contextLines,
    fullContent: content,
    totalLines: lines.length,
  }
}
```

---

## `bin/init.js`

The `npx patchly init` command. Auto-detects project root and creates `.patchlyrc.json`.

```js
#!/usr/bin/env node
// bin/init.js

import fs from 'fs'
import path from 'path'

const CONFIG_FILE = '.patchlyrc.json'

function detectFramework(projectRoot) {
  const pkgPath = path.resolve(projectRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) return 'unknown'

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  if (deps['next']) return 'nextjs'
  if (deps['vite'] && deps['react']) return 'react-vite'
  if (deps['vite'] && deps['vue']) return 'vue-vite'
  return 'unknown'
}

function detectDevPort(projectRoot) {
  // Check vite.config.js for custom port
  // Default: 5173 for Vite, 3000 for Next.js
  const framework = detectFramework(projectRoot)
  return framework === 'nextjs' ? 3000 : 5173
}

async function init() {
  const projectRoot = process.cwd()
  const configPath = path.resolve(projectRoot, CONFIG_FILE)

  if (fs.existsSync(configPath)) {
    console.log(`✅ ${CONFIG_FILE} already exists. Delete it and re-run to reset.`)
    return
  }

  const framework = detectFramework(projectRoot)
  const devPort = detectDevPort(projectRoot)

  const config = {
    projectRoot,
    devServerPort: devPort,
    framework,
    azureEndpoint: '',   // user fills this in
    azureApiKey: '',     // user fills this in — or set via env var PATCHLY_AZURE_KEY
    model: 'gpt-4o',
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

  console.log(`\n🩹 Patchly initialized!\n`)
  console.log(`Created ${CONFIG_FILE}`)
  console.log(`Detected framework: ${framework}`)
  console.log(`Detected dev port: ${devPort}`)

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`Next step: add Patchly to your vite.config.js\n`)
  console.log(`  import { patchlyPlugin } from 'patchly/vite'`)
  console.log(`\n  export default defineConfig({`)
  console.log(`    plugins: [patchlyPlugin(), react()],  // patchlyPlugin FIRST`)
  console.log(`  })`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
  console.log(`Then fill in your Azure OpenAI credentials in ${CONFIG_FILE}`)
  console.log(`Or set env vars: PATCHLY_AZURE_ENDPOINT and PATCHLY_AZURE_KEY\n`)
  console.log(`Then run: npx patchly`)
}

init()
```

Update `package.json` bin:
```json
"bin": {
  "patchly": "./agent/index.js",
  "patchly-init": "./bin/init.js"
}
```

Or handle it as a subcommand in `agent/index.js`:
```js
// agent/index.js — add at top
if (process.argv[2] === 'init') {
  import('./bin/init.js') // dynamic import runs the init script
} else {
  // normal server start
  main()
}
```

---

## Update `agent/server.js` to handle EDIT_REQUEST up to source resolution

Add to the `ws.on('message')` handler in `server.js`:

```js
import { resolveSource } from './sourceMapper.js'
import { MSG } from '../shared/protocol.js'

// Inside ws.on('message'):
if (msg.type === MSG.EDIT_REQUEST) {
  const { patchlySrc, elementHtml, elementClasses, prompt, sessionId } = msg

  console.log(`Edit request: "${prompt}" on ${patchlySrc}`)

  // Phase 3: resolve source only, no LLM yet
  const sourceResult = resolveSource(patchlySrc, config.projectRoot)

  if (!sourceResult.success) {
    ws.send(JSON.stringify({
      type: MSG.EDIT_ERROR,
      sessionId,
      code: sourceResult.code,
      message: sourceResult.message,
    }))
    return
  }

  console.log('✅ Source resolved:', sourceResult.absolutePath, 'line', sourceResult.lineNumber)
  console.log('Target line:', sourceResult.targetLine)

  // Phase 3: confirm to extension that source was found
  // Phase 4 will continue from here with LLM call
  ws.send(JSON.stringify({
    type: MSG.STATUS,
    phase3debug: true,
    resolvedPath: sourceResult.absolutePath,
    resolvedLine: sourceResult.lineNumber,
    targetLine: sourceResult.targetLine,
  }))
}
```

---

## Phase 3 Tasks Checklist

- [ ] Create `vite-plugin/index.js` (port from spike)
- [ ] Create `agent/sourceMapper.js`
- [ ] Create `bin/init.js`
- [ ] Update `package.json` exports and bin
- [ ] Run `npm install` to add Babel packages
- [ ] In test project: add `patchlyPlugin()` to `vite.config.js`
- [ ] Run `npx patchly init` in test project → confirm `.patchlyrc.json` created
- [ ] Restart Vite dev server → confirm `data-patchly-src` appears on elements in DevTools
- [ ] Start Patchly agent (`npx patchly`)
- [ ] Activate Patchly in browser, draw selection, type any prompt, press Enter
- [ ] Check agent terminal → must show "✅ Source resolved: /absolute/path/Hero.jsx line 5"
- [ ] Test all 4 edge cases from Phase 0 spike — all must resolve correctly

---

## Phase 3 Pass Criteria

- [ ] `npx patchly init` creates correct `.patchlyrc.json` with detected framework and port
- [ ] Vite plugin injects `data-patchly-src` on all JSX elements in dev mode
- [ ] `data-patchly-src` does NOT appear in production build
- [ ] Agent resolves every selection to correct absolute file path and line number
- [ ] All 4 Phase 0 edge cases pass
- [ ] Error cases handled: missing attribute, file not found, path traversal attempt

Proceed to Phase 4 only when all pass criteria are met.
