// agent/mcp/server.ts
// Thin stdio MCP server that proxies to the already-running patchly agent.
// Does NOT re-implement any AST/editing logic — it connects as a WebSocket
// client to ws://localhost:7842 and relays requests.
//
// Usage: npm run mcp  (or: tsx agent/mcp/server.ts)
// .mcp.json entry: { "command": "npm", "args": ["run", "mcp"] }

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import fs from 'fs'
import path from 'path'
import WebSocket from 'ws'
import { z } from 'zod'
import { MSG } from '../../shared/protocol.js'
import type { SelectionItem, ClassInfo } from '../../shared/protocol.js'
import { DEFAULT_PORT, LOCKFILE_REL, type AgentLockfile } from '../../shared/agentInfo.js'

const REQUEST_TIMEOUT_MS = 10_000
const NOT_FOUND_MSG =
  'Patchly agent not found — run `npx patchly` in your project first.'

/**
 * Discover the running agent via its per-project lockfile. The MCP server is
 * launched with cwd = the user's project, so we read <cwd>/.patchly/agent.json,
 * verify it belongs to THIS project (guards against editing a different running
 * app), and return its port. Falls back to DEFAULT_PORT if no lockfile exists.
 */
function discoverAgentPort(): number {
  const cwd = path.resolve(process.cwd())
  const lockPath = path.resolve(cwd, LOCKFILE_REL)
  if (!fs.existsSync(lockPath)) return DEFAULT_PORT

  let lock: AgentLockfile
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as AgentLockfile
  } catch {
    return DEFAULT_PORT
  }

  if (path.resolve(lock.projectRoot) !== cwd) {
    throw new Error(
      `Patchly agent lockfile is for a different project.\n` +
      `  lockfile projectRoot: ${lock.projectRoot}\n` +
      `  this MCP server cwd:  ${cwd}\n` +
      `Run the MCP server from the same project as the running agent.`,
    )
  }
  return lock.port
}

// ─── WebSocket agent client ───────────────────────────────────────────────────

type Resolver = (msg: Record<string, unknown>) => void

class PatchlyAgentClient {
  private ws: WebSocket | null = null
  // Keyed by sessionId. Each request echoes its sessionId in the reply so we
  // can safely multiplex concurrent tool calls without type-matching races.
  private pending = new Map<string, Resolver>()
  private connectPromise: Promise<void> | null = null

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = new Promise((resolve, reject) => {
      let port: number
      try {
        port = discoverAgentPort()
      } catch (err: unknown) {
        // projectRoot mismatch — surface the specific reason. Reset the cached
        // promise so a later call (after the user fixes it) can retry.
        this.connectPromise = null
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }

      const ws = new WebSocket(`ws://localhost:${port}`)
      const timer = setTimeout(() => {
        ws.terminate()
        reject(new Error(NOT_FOUND_MSG))
      }, 5_000)

      ws.once('open', () => {
        clearTimeout(timer)
        this.ws = ws
        resolve()
      })

      ws.once('error', (err) => {
        clearTimeout(timer)
        reject(new Error(`${NOT_FOUND_MSG} (${err.message})`))
      })

      ws.on('message', (raw) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(raw.toString()) } catch { return }

        const sid = msg.sessionId as string | undefined
        if (sid && this.pending.has(sid)) {
          const resolver = this.pending.get(sid)!
          this.pending.delete(sid)
          resolver(msg)
          return
        }

        // EDIT_ERROR without a matching sessionId: resolve all pending so
        // nothing hangs (e.g. agent crashed between request and response).
        if (msg.type === MSG.EDIT_ERROR) {
          for (const [key, res] of this.pending) {
            this.pending.delete(key)
            res(msg)
          }
        }
      })

      ws.on('close', () => {
        this.ws = null
        this.connectPromise = null
        // Reject any in-flight requests.
        for (const [key, res] of this.pending) {
          this.pending.delete(key)
          res({ type: 'DISCONNECTED', message: 'Patchly agent disconnected.' })
        }
      })
    })
    return this.connectPromise
  }

  /**
   * Send a message and await the reply that carries the same sessionId.
   * `payload` must include a `sessionId` field we can match on.
   */
  request(
    payload: Record<string, unknown> & { sessionId: string },
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to Patchly agent.'))
        return
      }
      const { sessionId } = payload
      const timer = setTimeout(() => {
        this.pending.delete(sessionId)
        reject(new Error(`Patchly agent timed out (session ${sessionId}).`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(sessionId, (msg) => {
        clearTimeout(timer)
        resolve(msg)
      })

      this.ws.send(JSON.stringify(payload))
    })
  }

  close(): void {
    this.ws?.close()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkSid(): string {
  return Math.random().toString(36).slice(2)
}

/** Parse "file:line:col" — handles Windows drive letters like "C:\…". */
function parsePatchlySrc(src: string): { file: string; line: number; column: number } | null {
  const parts = src.split(':')
  if (parts.length < 3) return null
  const column = parseInt(parts[parts.length - 1], 10)
  const line = parseInt(parts[parts.length - 2], 10)
  const file = parts.slice(0, parts.length - 2).join(':')
  if (isNaN(line) || isNaN(column)) return null
  return { file, line, column }
}

// ─── zod schemas for EditOperation (mirrors shared/operations.ts) ─────────────

const EditTargetSchema = z.object({
  file: z.string().describe('Relative path to the source file, e.g. "src/components/Hero.tsx"'),
  line: z.number().int().positive().describe('1-based line number'),
  column: z.number().int().nonnegative().describe('Column from data-patchly-src'),
  tagName: z.string().describe('Lowercase tag name, e.g. "button"'),
  componentName: z.string().optional(),
  identifyingAttrs: z.record(z.string(), z.string()).optional(),
  textSnippet: z.string().optional(),
})

const EditOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('setClassName'), target: EditTargetSchema, add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }),
  z.object({ op: z.literal('setAttribute'), target: EditTargetSchema, name: z.string(), value: z.string().nullable() }),
  z.object({ op: z.literal('setText'), target: EditTargetSchema, text: z.string() }),
  z.object({ op: z.literal('setInlineStyle'), target: EditTargetSchema, styles: z.record(z.string(), z.string()) }),
  z.object({ op: z.literal('wrapElement'), target: EditTargetSchema, wrapperTag: z.string(), wrapperClassName: z.string().optional() }),
  z.object({ op: z.literal('insertChild'), target: EditTargetSchema, position: z.union([z.literal('first'), z.literal('last'), z.number().int().nonnegative()]), jsx: z.string() }),
  z.object({ op: z.literal('replaceElement'), target: EditTargetSchema, jsx: z.string() }),
  z.object({ op: z.literal('removeElement'), target: EditTargetSchema }),
])

// ─── MCP server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'patchly', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

const agent = new PatchlyAgentClient()

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'patchly_current_selection',
      description:
        'THE PRIMARY TOOL. Returns what the user is pointing at in the browser (via the Patchly ' +
        'Chrome extension): the exact source location (file/line/column), tag name, source-accurate ' +
        'className breakdown (classNameKind: static | dynamic | none + class tokens), the element\'s ' +
        'computed CSS styles, AND a screenshot of the element as an image block so you can SEE it. ' +
        'Call this to resolve "what am I looking at" — then open that file and edit it yourself with ' +
        'your normal editing tools. You do NOT need patchly_apply for that; you have the precise ' +
        'location and a picture of the current visual state.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'patchly_inspect',
      description:
        'Reads the className of a specific element straight from source (not the live DOM). ' +
        'Useful for inspecting an element you know the patchlySrc for but have not selected. ' +
        'patchly_current_selection already runs inspect automatically for selected elements.',
      inputSchema: {
        type: 'object',
        properties: {
          patchlySrc: {
            type: 'string',
            description: 'The data-patchly-src pointer, format "file:line:col".',
          },
        },
        required: ['patchlySrc'],
      },
    },
    {
      name: 'patchly_apply',
      description:
        'OPTIONAL deterministic fast-path. In most cases you should edit the source file yourself ' +
        'using the location from patchly_current_selection — you already know exactly where it is. ' +
        'Use this tool only for trivial, mechanical tweaks (a className/style/text change) where you ' +
        'want Patchly\'s AST-safe edit + drift guard instead of editing by hand. ' +
        'Applies one EditOperation and hot-reloads via HMR; always returns the unified diff. ' +
        'If operation.target is omitted, the current browser selection is used. ' +
        'Set dryRun:true to preview the diff without writing.',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'object',
            description:
              'An EditOperation. op must be one of: setClassName, setAttribute, setText, ' +
              'setInlineStyle, wrapElement, insertChild, replaceElement, removeElement. ' +
              'target (file/line/column/tagName) is optional — omit to use the current selection.',
          },
          dryRun: {
            type: 'boolean',
            description: 'Preview the diff without writing to disk.',
          },
        },
        required: ['operation'],
      },
    },
    {
      name: 'patchly_screenshot',
      description:
        'Captures a fresh screenshot of the currently selected element and returns it as an image ' +
        'block. Call this AFTER making an edit and waiting a moment for HMR to reload the page, to ' +
        'visually confirm the change looks correct. Returns null if no element is selected.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    await agent.connect()
  } catch (err: unknown) {
    return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
  }

  // ── patchly_current_selection ─────────────────────────────────────────────
  if (name === 'patchly_current_selection') {
    // 1. Get the cached selection.
    const sid1 = mkSid()
    let selResponse: Record<string, unknown>
    try {
      selResponse = await agent.request({ type: MSG.GET_SELECTION, sessionId: sid1 })
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    const selection = (selResponse.selection ?? []) as SelectionItem[]
    if (selection.length === 0) {
      return {
        content: [{ type: 'text', text: 'No element selected. Click an element in the browser with the Patchly extension active.' }],
      }
    }

    // 2. Auto-inspect all selected sources to get source-accurate class data.
    const sid2 = mkSid()
    let infoResponse: Record<string, unknown>
    try {
      infoResponse = await agent.request({
        type: MSG.INSPECT,
        sessionId: sid2,
        patchlySources: selection.map((s) => s.patchlySrc),
      })
    } catch {
      infoResponse = { elements: [] }
    }

    const classInfos = (infoResponse.elements ?? []) as ClassInfo[]
    const classInfoBySrc = new Map(classInfos.map((ci) => [ci.patchlySrc, ci]))

    const items = selection.map((s) => {
      const parsed = parsePatchlySrc(s.patchlySrc)
      const info = classInfoBySrc.get(s.patchlySrc)
      return {
        patchlySrc: s.patchlySrc,
        file: parsed?.file ?? s.patchlySrc,
        line: parsed?.line ?? null,
        column: parsed?.column ?? null,
        tag: s.tag,
        // Source-accurate class data (from AST, not DOM):
        classNameKind: info?.classNameKind ?? 'unknown',
        classes: info?.classes ?? s.classes.split(/\s+/).filter(Boolean),
        ...(info?.dynamicText ? { dynamicText: info.dynamicText } : {}),
        // Visual state: curated computed styles + React component identity.
        ...(s.computedStyles ? { computedStyles: s.computedStyles } : {}),
        ...(s.reactInfo ? { reactInfo: s.reactInfo } : {}),
      }
    })

    const selectionId = (selResponse as Record<string, unknown>).selectionId as string | undefined

    // Mixed content: the structured pointer/styles/reactInfo as text, plus a
    // screenshot IMAGE block so the agent can literally SEE what it's editing.
    const payload = selectionId ? { selectionId, elements: items } : { elements: items }
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: JSON.stringify(payload, null, 2) },
    ]
    for (const s of selection) {
      if (s.screenshot) {
        content.push({ type: 'image', data: s.screenshot, mimeType: 'image/png' })
      }
    }

    return { content }
  }

  // ── patchly_inspect ───────────────────────────────────────────────────────
  if (name === 'patchly_inspect') {
    const patchlySrc = (args as Record<string, unknown>)?.patchlySrc as string | undefined
    if (!patchlySrc) {
      return { content: [{ type: 'text', text: 'patchlySrc is required.' }], isError: true }
    }

    const sessionId = mkSid()
    let response: Record<string, unknown>
    try {
      response = await agent.request({ type: MSG.INSPECT, sessionId, patchlySources: [patchlySrc] })
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    if (response.type === MSG.EDIT_ERROR) {
      return { content: [{ type: 'text', text: `Inspect failed: ${response.message}` }], isError: true }
    }
    return { content: [{ type: 'text', text: JSON.stringify(response.elements, null, 2) }] }
  }

  // ── patchly_screenshot ────────────────────────────────────────────────────
  if (name === 'patchly_screenshot') {
    const sessionId = mkSid()
    let response: Record<string, unknown>
    try {
      response = await agent.request({ type: MSG.SCREENSHOT_REQUEST, sessionId })
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    const screenshot = response.screenshot as string | null
    if (!screenshot) {
      return {
        content: [{ type: 'text', text: 'No screenshot available — no element is currently selected in the browser.' }],
      }
    }
    return {
      content: [
        { type: 'text', text: 'Current element state:' },
        { type: 'image', data: screenshot, mimeType: 'image/png' },
      ],
    }
  }

  // ── patchly_apply ─────────────────────────────────────────────────────────
  if (name === 'patchly_apply') {
    const rawArgs = args as Record<string, unknown>
    const dryRun = rawArgs?.dryRun === true
    let rawOp = rawArgs?.operation as Record<string, unknown>

    if (!rawOp) {
      return { content: [{ type: 'text', text: 'operation is required.' }], isError: true }
    }

    // Auto-fill target from current selection if omitted.
    if (!rawOp.target) {
      const sid = mkSid()
      let selResponse: Record<string, unknown>
      try {
        selResponse = await agent.request({ type: MSG.GET_SELECTION, sessionId: sid })
      } catch (err: unknown) {
        return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
      }

      const selection = (selResponse.selection ?? []) as SelectionItem[]
      if (selection.length === 0) {
        return {
          content: [{ type: 'text', text: 'No element selected and no target provided. Select an element in the browser first.' }],
          isError: true,
        }
      }

      const sel = selection[0]
      const parsed = parsePatchlySrc(sel.patchlySrc)
      if (!parsed) {
        return { content: [{ type: 'text', text: `Could not parse patchlySrc: ${sel.patchlySrc}` }], isError: true }
      }
      rawOp = { ...rawOp, target: { file: parsed.file, line: parsed.line, column: parsed.column, tagName: sel.tag } }
    }

    const parsed = EditOperationSchema.safeParse(rawOp)
    if (!parsed.success) {
      return {
        content: [{ type: 'text', text: `Invalid operation: ${parsed.error.message}` }],
        isError: true,
      }
    }

    const sessionId = mkSid()
    let response: Record<string, unknown>
    try {
      response = await agent.request({
        type: MSG.APPLY_OPS,
        sessionId,
        operations: [parsed.data],
        explanation: `MCP: ${parsed.data.op}`,
        dryRun,
      })
    } catch (err: unknown) {
      return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }], isError: true }
    }

    if (response.type === MSG.EDIT_ERROR) {
      return { content: [{ type: 'text', text: `Apply failed: ${response.message}` }], isError: true }
    }

    const diffBlock = response.diff
      ? `\n\n\`\`\`diff\n${response.diff}\n\`\`\``
      : ''

    if (dryRun) {
      return {
        content: [{ type: 'text', text: `Dry run — no changes written.${diffBlock || ' (no diff)'}` }],
      }
    }
    return {
      content: [{ type: 'text', text: `Applied \`${parsed.data.op}\` successfully.${diffBlock}` }],
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
})

// ─── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('Patchly MCP server running on stdio\n')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`)
  process.exit(1)
})
